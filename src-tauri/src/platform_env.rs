//! Platform-aware command lookup and environment setup.
//!
//! macOS applications launched from Finder do not inherit the PATH that a
//! user's interactive shell builds. Keep command discovery and child-process
//! PATH setup in one place so the packaged app can find Homebrew and common
//! Node version-manager installations as well as system tools.

use std::ffi::{OsStr, OsString};
#[cfg(target_os = "macos")]
use std::path::Path;
use std::path::PathBuf;
use std::process::Command;

#[cfg(target_os = "macos")]
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
struct NodeVersion {
    major: u64,
    minor: u64,
    patch: u64,
}

/// Locate an executable using the PATH that the app should expose.
pub fn locate_executable(program: impl AsRef<OsStr>) -> Option<PathBuf> {
    let cwd = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    which::which_in(program, effective_path().as_deref(), cwd).ok()
}

/// Apply the app's effective PATH to a child process.
pub fn apply_effective_path(command: &mut Command) {
    if let Some(path) = effective_path() {
        command.env("PATH", path);
    }
}

/// Return the current process PATH with platform-specific GUI-app locations.
pub fn effective_path() -> Option<OsString> {
    let current = std::env::var_os("PATH");

    #[cfg(target_os = "macos")]
    {
        return build_macos_path(current, dirs::home_dir());
    }

    #[cfg(not(target_os = "macos"))]
    current
}

#[cfg(target_os = "macos")]
fn build_macos_path(current: Option<OsString>, home: Option<PathBuf>) -> Option<OsString> {
    let mut paths = current
        .as_deref()
        .map(std::env::split_paths)
        .map(|items| items.collect::<Vec<_>>())
        .unwrap_or_default();

    // Finder-launched apps commonly omit these locations even though they are
    // present in the user's terminal environment.
    for path in [
        "/opt/homebrew/bin",
        "/opt/homebrew/sbin",
        "/usr/local/bin",
        "/usr/local/sbin",
        "/usr/bin",
        "/bin",
        "/usr/sbin",
        "/sbin",
    ] {
        append_unique(&mut paths, PathBuf::from(path));
    }

    if let Some(home) = home.as_deref() {
        for path in [
            home.join(".volta/bin"),
            home.join(".asdf/shims"),
            home.join(".local/bin"),
            home.join(".local/share/mise/shims"),
            home.join(".mise/shims"),
            home.join(".npm-global/bin"),
            home.join(".bun/bin"),
            home.join("Library/pnpm"),
        ] {
            append_unique(&mut paths, path);
        }

        // nvm and fnm keep Node installations in versioned directories rather
        // than one stable bin directory. Prefer an explicit default alias when
        // one is available, then sort actual semantic versions newest-first.
        for (root, default_alias) in [
            (
                home.join(".nvm/versions/node"),
                Some(home.join(".nvm/alias/default")),
            ),
            (
                home.join(".fnm/node-versions"),
                Some(home.join(".fnm/aliases/default")),
            ),
            (
                home.join("Library/Application Support/fnm/node-versions"),
                Some(home.join("Library/Application Support/fnm/aliases/default")),
            ),
        ] {
            for path in version_manager_bins(&root, default_alias.as_deref()) {
                append_unique(&mut paths, path);
            }
        }
    }

    // Homebrew versioned formulae may not be linked into bin.
    for prefix in [Path::new("/opt/homebrew/opt"), Path::new("/usr/local/opt")] {
        if let Ok(entries) = std::fs::read_dir(prefix) {
            for entry in entries.flatten() {
                let name = entry.file_name();
                if name.to_string_lossy().starts_with("node") {
                    append_unique(&mut paths, entry.path().join("bin"));
                }
            }
        }
    }

    std::env::join_paths(paths).ok()
}

#[cfg(target_os = "macos")]
fn parse_node_version(value: &str) -> Option<NodeVersion> {
    let trimmed = value.trim();
    let without_prefix = trimmed.strip_prefix('v').unwrap_or(trimmed);
    let value = without_prefix
        .split_once('-')
        .map(|(version, _)| version)
        .unwrap_or(without_prefix);
    let mut parts = value.split('.');
    let major = parts.next()?.parse().ok()?;
    let minor = parts.next().unwrap_or("0").parse().ok()?;
    let patch = parts.next().unwrap_or("0").parse().ok()?;
    Some(NodeVersion {
        major,
        minor,
        patch,
    })
}

#[cfg(target_os = "macos")]
fn default_alias_version(path: Option<&Path>) -> Option<NodeVersion> {
    let path = path?;
    let value = std::fs::read_link(path)
        .ok()
        .and_then(|target| {
            target
                .file_name()
                .map(|name| name.to_string_lossy().into_owned())
        })
        .or_else(|| std::fs::read_to_string(path).ok())?;
    parse_node_version(value.trim())
}

#[cfg(target_os = "macos")]
fn version_manager_bins(root: &Path, default_alias: Option<&Path>) -> Vec<PathBuf> {
    let preferred = default_alias_version(default_alias);
    let mut entries = match std::fs::read_dir(root) {
        Ok(entries) => entries
            .flatten()
            .filter(|entry| entry.path().is_dir())
            .collect::<Vec<_>>(),
        Err(_) => return Vec::new(),
    };

    entries.sort_by(|left, right| {
        let left_version = parse_node_version(&left.file_name().to_string_lossy());
        let right_version = parse_node_version(&right.file_name().to_string_lossy());
        let left_preferred = left_version.is_some() && left_version == preferred;
        let right_preferred = right_version.is_some() && right_version == preferred;
        right_preferred
            .cmp(&left_preferred)
            .then_with(|| right_version.cmp(&left_version))
            .then_with(|| right.file_name().cmp(&left.file_name()))
    });

    entries
        .into_iter()
        .flat_map(|entry| {
            let path = entry.path();
            [path.join("bin"), path.join("installation/bin")]
        })
        .collect()
}

#[cfg(target_os = "macos")]
fn append_unique(paths: &mut Vec<PathBuf>, candidate: PathBuf) {
    if !paths.iter().any(|path| path == &candidate) {
        paths.push(candidate);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[cfg(target_os = "macos")]
    use std::fs;

    #[test]
    fn preserves_an_existing_path() {
        let path = build_test_path(Some(OsString::from("/custom/bin")));
        assert!(path.to_string_lossy().starts_with("/custom/bin"));
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn adds_standard_macos_gui_paths() {
        let path = build_macos_path(Some(OsString::from("/custom/bin")), None)
            .expect("macOS PATH should be constructible")
            .to_string_lossy()
            .into_owned();
        assert!(path.contains("/opt/homebrew/bin"));
        assert!(path.contains("/usr/local/bin"));
        assert!(path.contains("/usr/bin"));
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn version_manager_bins_use_semver_and_prefer_default_alias() {
        let base =
            std::env::temp_dir().join(format!("agents-launcher-path-{}", uuid::Uuid::new_v4()));
        let root = base.join("versions");
        let alias = base.join("alias/default");
        for version in ["v9.20.0", "v10.2.0", "v22.1.0"] {
            fs::create_dir_all(root.join(version).join("bin")).expect("create version bin");
        }
        fs::create_dir_all(alias.parent().expect("alias parent")).expect("create alias directory");
        fs::write(&alias, "v10.2.0\n").expect("write default alias");

        let bins = version_manager_bins(&root, Some(&alias));
        assert_eq!(bins[0], root.join("v10.2.0/bin"));
        assert_eq!(bins[2], root.join("v22.1.0/bin"));
        assert_eq!(bins[4], root.join("v9.20.0/bin"));
        let _ = fs::remove_dir_all(base);
    }

    #[cfg(not(target_os = "macos"))]
    fn build_test_path(current: Option<OsString>) -> OsString {
        current.expect("test path should be present")
    }

    #[cfg(target_os = "macos")]
    fn build_test_path(current: Option<OsString>) -> OsString {
        build_macos_path(current, None).expect("test path should be constructible")
    }
}
