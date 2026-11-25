{
  description = "LOTUSim UI backend — Express + ROS 2 bridge for the LOTUSim UI";

  # The ROS stack is absent from cache.nixos.org, and nixConfig only helps trusted-users.
  nixConfig = {
    extra-substituters = [ "https://ros.cachix.org" ];
    extra-trusted-public-keys = [
      "ros.cachix.org-1:dSyZxI8geDCJrwgvCOHDoAfOm5sV1wCPjBkKL+38Rvo="
    ];
  };

  inputs = {
    nix-ros-overlay.url = "github:lopsided98/nix-ros-overlay/master";
    nixpkgs.follows = "nix-ros-overlay/nixpkgs";
    flake-utils.follows = "nix-ros-overlay/flake-utils";
  };

  outputs = { self, nix-ros-overlay, nixpkgs, flake-utils }:
    let
      # Found by running it: rclnodejs' own lib/ needs far more than binding.gyp names.
      rosEnv = pkgs:
        let
          rosRuntime = with pkgs.rosPackages.jazzy; [
            rcl
            rcl-action
            rcl-lifecycle
            rcl-yaml-param-parser
            rcutils
            rmw
            rosidl-runtime-c
            rosidl-typesupport-interface
            rosidl-dynamic-typesupport
            rosidl-runtime-cpp
            rmw-implementation
            rmw-fastrtps-cpp
            action-msgs
            service-msgs
            diagnostic-msgs
            unique-identifier-msgs
            builtin-interfaces
            lifecycle-msgs
            type-description-interfaces
            std-msgs
            std-srvs
            geometry-msgs
            geographic-msgs
            rcl-interfaces
            rosgraph-msgs
            rcpputils
            rcl-logging-interface
            # binding.gyp locates ROS with `which ros2`, then dirname twice.
            ros2cli
            # lotusim_sensor_msgs/msg/GPS.msg uses sensor_msgs without declaring it.
            sensor-msgs
            rosidl-parser
            rosidl-adapter
          ];
        in
        {
          inherit rosRuntime;

          # One merged prefix for gyp alone: rclnodejs assumes apt's single-root include/ and lib/.
          amentEnv = pkgs.buildEnv {
            name = "ament-merged";
            ignoreCollisions = true;
            paths = rosRuntime;
          };
        };

      # A builder, not a flake input: LOTUSim passes its messages in, so the arrow points one way.
      mkBackend =
        { pkgs
        , rosMessages ? null
        , assets ? null
        , nodejs ? pkgs.nodejs_22
        }:
        let
          inherit (rosEnv pkgs) rosRuntime amentEnv;
          inherit (pkgs.lib) optionalString optionals escapeShellArgs;

          # generate_messages.js swallows its own errors and exits 0, so assert the output.
          expectedPackages = [
            "action_msgs"
            "builtin_interfaces"
            "geographic_msgs"
            "geometry_msgs"
            "lifecycle_msgs"
            "rcl_interfaces"
            "rosgraph_msgs"
            "sensor_msgs"
            "service_msgs"
            "srv_msg"
            "std_msgs"
            "std_srvs"
            "type_description_interfaces"
            "unique_identifier_msgs"
          ] ++ optionals (rosMessages != null) [
            "lotusim_msgs"
            "lotusim_sensor_msgs"
          ];

          appDir = "lib/node_modules/lotusim_backend";
          messagePrefix = optionalString (rosMessages != null) "${rosMessages}:";

          # Expensive and LOTUSim-independent, so standalone and coupled builds share it.
          app = pkgs.buildNpmPackage {
            pname = "lotusim-ui-backend-app";
            version = "1.0.0";
            src = ./.;
            inherit nodejs;

            npmDepsHash = "sha256-KFKROrhibQ0qe4wvK+bETXSU/MiqzYzS+9VZvFI+QbA=";

            # binding.gyp runs `which ros2`, and stdenv has no which.
            nativeBuildInputs = [ pkgs.which ];

            # rclnodejs' postinstall is codegen, which belongs in the assembly with LOTUSim's messages.
            npmFlags = [ "--ignore-scripts" ];

            buildPhase = ''
              runHook preBuild

              export ROS_DISTRO=jazzy
              export PATH=${amentEnv}/bin:$PATH

              ( cd node_modules/rclnodejs && node "$npm_config_node_gyp" rebuild -j "$NIX_BUILD_CORES" )

              # rclnodejs prefers a prebuild matching /etc/os-release over the one just built.
              rm -rf node_modules/rclnodejs/prebuilds

              node node_modules/.bin/tsc

              runHook postBuild
            '';

            # .gitignore lists /dist, so npmInstallHook's npm pack copy would drop it.
            installPhase = ''
              runHook preInstall

              # tsc, jest and their trees are build-only; npmInstallHook would have pruned them.
              npm prune --omit=dev --ignore-scripts

              mkdir -p $out/${appDir}
              cp -r dist node_modules package.json $out/${appDir}/
              runHook postInstall
            '';
          };

          # Codegen runs in place in the assembly: rclnodejs hardcodes generated/ relative to
          # __dirname, and a separate derivation could only be copied back in anyway.
          backend = pkgs.runCommand "lotusim-ui-backend"
            {
              # rosidl_gen shells out to python3 to parse .msg files.
              nativeBuildInputs = [ nodejs pkgs.python3 pkgs.makeWrapper ];
              buildInputs = rosRuntime;
              passthru = { inherit app amentEnv; };
              meta.mainProgram = "lotusim-ui-backend";
            } ''
            cp -a --no-preserve=mode,ownership ${app} $out
            cd $out/${appDir}

            export HOME=$TMPDIR
            export ROS_DISTRO=jazzy
            export AMENT_PREFIX_PATH="${messagePrefix}$AMENT_PREFIX_PATH"

            node node_modules/.bin/generate-ros-messages

            for pkg in ${escapeShellArgs expectedPackages}; do
              if [ ! -d node_modules/rclnodejs/generated/$pkg ]; then
                echo "ERROR: codegen produced no $pkg — AMENT_PREFIX_PATH is short"
                echo "generated: $(ls node_modules/rclnodejs/generated | tr '\n' ' ')"
                exit 1
              fi
            done

            # Paths come from the ROS setup hooks: the rmw typesupport libraries are dlopened.
            wrapArgs=(
              --set ROS_DISTRO jazzy
              --set AMENT_PREFIX_PATH "${messagePrefix}$AMENT_PREFIX_PATH"
              --set LD_LIBRARY_PATH "${optionalString (rosMessages != null) "${rosMessages}/lib:"}$LD_LIBRARY_PATH"
              --set FASTDDS_BUILTIN_TRANSPORTS UDPv4
            )
            ${optionalString (assets != null) ''
              wrapArgs+=(
                --set-default LOTUSIM_MODELS_PATH "${assets}/models/"
                --set-default LOTUSIM_SCENARIOS_PATH "${assets}/scenarios"
              )
            ''}

            makeWrapper ${nodejs}/bin/node $out/bin/lotusim-ui-backend \
              --add-flags $out/${appDir}/dist/main.js \
              "''${wrapArgs[@]}"
          '';
        in
        backend;

      # A builder for the same reason: the shell that has LOTUSim's messages is composed there.
      mkBackendShell =
        { pkgs
        , rosMessages ? null
        , nodejs ? pkgs.nodejs_22
        }:
        let
          inherit (rosEnv pkgs) rosRuntime amentEnv;
        in
        pkgs.mkShell {
          name = "lotusim-ui-backend-shell";

          # rosRuntime, not amentEnv: only the setup hooks reach the dlopened rmw typesupport.
          packages = [ nodejs pkgs.python3 pkgs.which ] ++ rosRuntime;

          shellHook = ''
            export ROS_DISTRO=jazzy

            # `which ros2` dirnamed twice is how binding.gyp finds ROS, so the merged prefix leads.
            export PATH="${amentEnv}/bin:$PATH"
          '' + pkgs.lib.optionalString (rosMessages != null) ''
            export AMENT_PREFIX_PATH="${rosMessages}:$AMENT_PREFIX_PATH"
            export LD_LIBRARY_PATH="${rosMessages}/lib:$LD_LIBRARY_PATH"
          '';
        };
    in
    { lib = { inherit mkBackend mkBackendShell; }; } //
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs {
          inherit system;
          overlays = [ nix-ros-overlay.overlays.default ];
        };

        # Core messages only: builds and type-checks here, but cannot start — see the README.
        backend = mkBackend { inherit pkgs; };
      in
      {
        packages = {
          default = backend;
          inherit (backend) app;
        };

        apps.default = {
          type = "app";
          program = "${backend}/bin/lotusim-ui-backend";
        };

        # Core messages only, like packages.default; LOTUSim composes the shell that has more.
        devShells.default = mkBackendShell { inherit pkgs; };
      });
}
