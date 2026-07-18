//! Minimal macOS Keychain backend for Codex profile API keys.
//!
//! Secrets are generic-password items scoped by a stable service name and the
//! launcher profile ID as account. The API never exposes a secret in command
//! arguments, files, logs, or diagnostics.

#![cfg(target_os = "macos")]

use std::ffi::{c_char, c_void};
use std::ptr;

pub(crate) const SERVICE: &str = "com.agentslauncher.app.codex-profile";
const ERR_SEC_ITEM_NOT_FOUND: i32 = -25300;

type OSStatus = i32;
type SecKeychainRef = *const c_void;
type SecKeychainItemRef = *mut c_void;

#[link(name = "Security", kind = "framework")]
extern "C" {
    fn SecKeychainFindGenericPassword(
        keychain: SecKeychainRef,
        service_name_length: u32,
        service_name: *const c_char,
        account_name_length: u32,
        account_name: *const c_char,
        password_length: *mut u32,
        password_data: *mut *mut c_void,
        item_ref: *mut SecKeychainItemRef,
    ) -> OSStatus;
    fn SecKeychainAddGenericPassword(
        keychain: SecKeychainRef,
        service_name_length: u32,
        service_name: *const c_char,
        account_name_length: u32,
        account_name: *const c_char,
        password_length: u32,
        password_data: *const c_void,
        item_ref: *mut SecKeychainItemRef,
    ) -> OSStatus;
    fn SecKeychainItemModifyAttributesAndData(
        item_ref: SecKeychainItemRef,
        attr_list: *const c_void,
        length: u32,
        data: *const c_void,
    ) -> OSStatus;
    fn SecKeychainItemDelete(item_ref: SecKeychainItemRef) -> OSStatus;
    fn SecKeychainItemFreeContent(attr_list: *mut c_void, data: *mut c_void) -> OSStatus;
}

#[link(name = "CoreFoundation", kind = "framework")]
extern "C" {
    fn CFRelease(value: *const c_void);
}

fn status_error(operation: &str, status: OSStatus) -> String {
    format!("macOS Keychain {operation}失败（OSStatus {status}）")
}

fn key_parts(profile_id: &str) -> (&[u8], &[u8]) {
    (SERVICE.as_bytes(), profile_id.as_bytes())
}

fn release_item(item: SecKeychainItemRef) {
    if !item.is_null() {
        unsafe { CFRelease(item.cast_const()) };
    }
}

pub fn read(profile_id: &str) -> Result<Option<String>, String> {
    let (service, account) = key_parts(profile_id);
    let mut password_length = 0_u32;
    let mut password_data = ptr::null_mut();
    let mut item = ptr::null_mut();
    let status = unsafe {
        SecKeychainFindGenericPassword(
            ptr::null(),
            service.len() as u32,
            service.as_ptr().cast(),
            account.len() as u32,
            account.as_ptr().cast(),
            &mut password_length,
            &mut password_data,
            &mut item,
        )
    };
    if status == ERR_SEC_ITEM_NOT_FOUND {
        return Ok(None);
    }
    if status != 0 {
        release_item(item);
        return Err(status_error("读取", status));
    }

    let bytes = unsafe {
        std::slice::from_raw_parts(password_data.cast::<u8>(), password_length as usize).to_vec()
    };
    let free_status = unsafe { SecKeychainItemFreeContent(ptr::null_mut(), password_data) };
    release_item(item);
    if free_status != 0 {
        return Err(status_error("释放读取缓冲区", free_status));
    }
    String::from_utf8(bytes)
        .map(Some)
        .map_err(|error| format!("macOS Keychain 中的 CodeX 凭据不是 UTF-8：{error}"))
}

pub fn write(profile_id: &str, secret: &str) -> Result<(), String> {
    let (service, account) = key_parts(profile_id);
    let bytes = secret.as_bytes();
    let mut item = ptr::null_mut();
    let find_status = unsafe {
        SecKeychainFindGenericPassword(
            ptr::null(),
            service.len() as u32,
            service.as_ptr().cast(),
            account.len() as u32,
            account.as_ptr().cast(),
            ptr::null_mut(),
            ptr::null_mut(),
            &mut item,
        )
    };
    let status = if find_status == 0 {
        unsafe {
            SecKeychainItemModifyAttributesAndData(
                item,
                ptr::null(),
                bytes.len() as u32,
                bytes.as_ptr().cast(),
            )
        }
    } else if find_status == ERR_SEC_ITEM_NOT_FOUND {
        unsafe {
            SecKeychainAddGenericPassword(
                ptr::null(),
                service.len() as u32,
                service.as_ptr().cast(),
                account.len() as u32,
                account.as_ptr().cast(),
                bytes.len() as u32,
                bytes.as_ptr().cast(),
                ptr::null_mut(),
            )
        }
    } else {
        release_item(item);
        return Err(status_error("定位", find_status));
    };
    release_item(item);
    if status == 0 {
        Ok(())
    } else {
        Err(status_error("保存", status))
    }
}

pub fn delete(profile_id: &str) -> Result<(), String> {
    let (service, account) = key_parts(profile_id);
    let mut item = ptr::null_mut();
    let find_status = unsafe {
        SecKeychainFindGenericPassword(
            ptr::null(),
            service.len() as u32,
            service.as_ptr().cast(),
            account.len() as u32,
            account.as_ptr().cast(),
            ptr::null_mut(),
            ptr::null_mut(),
            &mut item,
        )
    };
    if find_status == ERR_SEC_ITEM_NOT_FOUND {
        return Ok(());
    }
    if find_status != 0 {
        release_item(item);
        return Err(status_error("定位", find_status));
    }
    let status = unsafe { SecKeychainItemDelete(item) };
    release_item(item);
    if status == 0 || status == ERR_SEC_ITEM_NOT_FOUND {
        Ok(())
    } else {
        Err(status_error("删除", status))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keychain_namespace_is_stable_and_profile_scoped() {
        assert_eq!(SERVICE, "com.agentslauncher.app.codex-profile");
        assert_ne!(key_parts("profile-a").1, key_parts("profile-b").1);
    }
}
