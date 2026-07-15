//! Small transactional writer for user-owned JSON files.
//!
//! Content is validated before the current file is moved aside. A successful
//! commit keeps a `.bak` copy; a failed commit restores that backup.

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use serde_json::Value;

fn sidecar_path(path: &Path, suffix: &str) -> PathBuf {
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| format!("{value}.{suffix}"))
        .unwrap_or_else(|| suffix.to_string());
    path.with_extension(extension)
}

pub fn write_json_atomic(path: &Path, content: &[u8], label: &str) -> Result<(), String> {
    serde_json::from_slice::<Value>(content)
        .map_err(|error| format!("{label} 写入内容不是有效 JSON：{error}"))?;

    let parent = path
        .parent()
        .ok_or_else(|| format!("{label} 文件没有父目录"))?;
    fs::create_dir_all(parent).map_err(|error| format!("无法创建 {label} 目录：{error}"))?;

    let temp_path = sidecar_path(path, "tmp");
    let backup_path = sidecar_path(path, "bak");
    let write_result = (|| {
        let mut temp = fs::File::create(&temp_path)
            .map_err(|error| format!("无法创建 {label} 临时文件：{error}"))?;
        temp.write_all(content)
            .map_err(|error| format!("无法写入 {label} 临时文件：{error}"))?;
        temp.sync_all()
            .map_err(|error| format!("无法刷新 {label} 临时文件：{error}"))?;
        drop(temp);

        let verification =
            fs::read(&temp_path).map_err(|error| format!("无法校验 {label} 临时文件：{error}"))?;
        serde_json::from_slice::<Value>(&verification)
            .map_err(|error| format!("{label} 临时文件校验失败：{error}"))?;

        if path.exists() {
            if backup_path.exists() {
                fs::remove_file(&backup_path)
                    .map_err(|error| format!("无法替换 {label} 备份：{error}"))?;
            }
            fs::rename(path, &backup_path).map_err(|error| format!("无法备份 {label}：{error}"))?;
        }

        if let Err(error) = fs::rename(&temp_path, path) {
            if backup_path.exists() && !path.exists() {
                let _ = fs::rename(&backup_path, path);
            }
            return Err(format!("无法提交 {label}：{error}"));
        }

        Ok(())
    })();

    if write_result.is_err() && temp_path.exists() {
        let _ = fs::remove_file(&temp_path);
    }
    write_result
}

pub fn restore_json_backup_if_missing(path: &Path, label: &str) -> Result<bool, String> {
    if path.exists() {
        return Ok(false);
    }
    let backup_path = sidecar_path(path, "bak");
    if !backup_path.exists() {
        return Ok(false);
    }

    let content =
        fs::read(&backup_path).map_err(|error| format!("无法读取 {label} 备份：{error}"))?;
    serde_json::from_slice::<Value>(&content)
        .map_err(|error| format!("{label} 备份不是有效 JSON：{error}"))?;
    write_json_atomic(path, &content, label)?;
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

    fn temp_file(name: &str) -> PathBuf {
        std::env::temp_dir()
            .join(format!("cc-launcher-{}", Uuid::new_v4()))
            .join(name)
    }

    #[test]
    fn invalid_json_never_replaces_the_current_file() {
        let path = temp_file("state.json");
        fs::create_dir_all(path.parent().expect("parent")).expect("create temp directory");
        fs::write(&path, br#"{"safe":true}"#).expect("write original");

        let error =
            write_json_atomic(&path, b"{invalid", "测试配置").expect_err("invalid JSON must fail");

        assert!(error.contains("不是有效 JSON"));
        assert_eq!(
            fs::read_to_string(&path).expect("read original"),
            r#"{"safe":true}"#
        );
        let _ = fs::remove_dir_all(path.parent().expect("parent"));
    }

    #[test]
    fn successful_commit_keeps_a_verified_backup() {
        let path = temp_file("state.json");
        fs::create_dir_all(path.parent().expect("parent")).expect("create temp directory");
        fs::write(&path, br#"{"version":1}"#).expect("write original");

        write_json_atomic(&path, br#"{"version":2}"#, "测试配置").expect("commit");

        assert_eq!(
            fs::read_to_string(&path).expect("read current"),
            r#"{"version":2}"#
        );
        assert_eq!(
            fs::read_to_string(sidecar_path(&path, "bak")).expect("read backup"),
            r#"{"version":1}"#,
        );
        let _ = fs::remove_dir_all(path.parent().expect("parent"));
    }

    #[test]
    fn missing_current_file_is_restored_from_a_verified_backup() {
        let path = temp_file("state.json");
        fs::create_dir_all(path.parent().expect("parent")).expect("create temp directory");
        fs::write(sidecar_path(&path, "bak"), br#"{"version":1}"#).expect("write backup");

        assert!(restore_json_backup_if_missing(&path, "测试配置").expect("restore backup"));
        assert_eq!(
            fs::read_to_string(&path).expect("read restored file"),
            r#"{"version":1}"#,
        );
        let _ = fs::remove_dir_all(path.parent().expect("parent"));
    }
}
