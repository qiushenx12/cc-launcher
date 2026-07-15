import subprocess
import shutil
import os

PROJECT_DIR = os.path.dirname(os.path.abspath(__file__))


def check_python():
    if shutil.which("python") is None and shutil.which("python3") is None:
        print("Python not found. Please install Python 3 and add to PATH.")
        input("\nPress Enter to exit...")
        return False
    return True


def check_node():
    node = shutil.which("node")
    if node is None:
        print("Node.js not found. Please install Node.js 20+ and add to PATH.")
        input("\nPress Enter to exit...")
        return False
    ret = subprocess.run(["node", "-v"], capture_output=True, text=True)
    version = ret.stdout.strip().lstrip("v")
    major = int(version.split(".")[0])
    if major < 20:
        print(f"Node.js version {version} detected. Node.js 20+ required.")
        input("\nPress Enter to exit...")
        return False
    print(f"Node.js {version} OK")
    return True


def check_npm():
    if shutil.which("npm") is None:
        print("npm not found.")
        input("\nPress Enter to exit...")
        return False
    return True


def check_rust():
    rustc = shutil.which("rustc")
    cargo = shutil.which("cargo")
    if rustc is None or cargo is None:
        print("Rust toolchain not found. Please install Rust at https://rustup.rs")
        input("\nPress Enter to exit...")
        return False
    ret = subprocess.run(["rustc", "-V"], capture_output=True, text=True)
    print(f"Rust {ret.stdout.strip()} OK")
    return True


def install_deps():
    package_json = os.path.join(PROJECT_DIR, "package.json")
    node_modules = os.path.join(PROJECT_DIR, "node_modules")
    if not os.path.exists(package_json):
        print("package.json not found.")
        input("\nPress Enter to exit...")
        return False
    if not os.path.exists(node_modules):
        print("Installing npm dependencies (node_modules/ not found)...")
        ret = subprocess.run(
            ["npm", "install"],
            cwd=PROJECT_DIR,
            capture_output=False,
            shell=True,
        )
        if ret.returncode != 0:
            print("npm install failed.")
            input("\nPress Enter to exit...")
            return False
        print("Dependencies installed.")
    else:
        print("Dependencies already installed.")
    return True


def run_dev():
    print("Starting Tauri dev mode...")
    subprocess.run(["npm", "run", "tauri", "dev"], cwd=PROJECT_DIR, shell=True)


def main():
    all_ok = True
    print("Checking environment...")
    all_ok = all_ok and check_python()
    all_ok = all_ok and check_npm()
    all_ok = all_ok and check_node()
    all_ok = all_ok and check_rust()
    print()

    if not all_ok:
        input("\nPress Enter to exit...")
        return

    if not install_deps():
        input("\nPress Enter to exit...")
        return

    run_dev()
    print("\nDev mode exited.")
    input("\nPress Enter to exit...")


if __name__ == "__main__":
    main()
