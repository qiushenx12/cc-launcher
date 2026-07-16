fn main() {
    println!("cargo:rerun-if-changed=icons/app.ico");
    tauri_build::build()
}
