{
  description = "shotput — self-contained dev shell";

  # This flake lives INSIDE the shotput repo and is self-contained —
  # entered from this directory (`cd shotput && nix develop`, or via
  # direnv), it sees its own git-tracked files normally.
  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs =
    {
      self,
      nixpkgs,
      flake-utils,
      ...
    }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = import nixpkgs { inherit system; };
      in
      {
        devShells.default = pkgs.mkShell {
          packages = [
            pkgs.bun
            pkgs.uv
          ];
          shellHook = ''
            # uv/Python only needed for the optional Jinja2 conformance
            # harness (test/conformance) — `uv add jinja2` there if used.
            echo "shotput :: $(bun --version)"
          '';
        };
      }
    );
}
