use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::cli_contract::{CliIssueCode, CliKind, CliStatusState};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CapabilityProbeStatus {
    Available,
    Failed,
    NotRun,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CapabilityProbe {
    pub capability: String,
    pub command: Vec<String>,
    pub status: CapabilityProbeStatus,
    pub evidence: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CliCapabilityFixture {
    pub fixture_version: u32,
    pub captured_at: String,
    pub kind: CliKind,
    pub cli_version: Option<String>,
    pub executable_source: String,
    pub status: CliStatusState,
    pub issue_code: Option<CliIssueCode>,
    pub probes: Vec<CapabilityProbe>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenCodeTimeRange {
    pub created: i64,
    pub updated: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenCodeProjectIcon {
    pub color: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenCodeProject {
    pub id: String,
    pub worktree: String,
    #[serde(default)]
    pub vcs: Option<String>,
    #[serde(default)]
    pub icon: Option<OpenCodeProjectIcon>,
    pub time: OpenCodeTimeRange,
    #[serde(default)]
    pub sandboxes: Vec<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenCodeSession {
    pub id: String,
    pub title: String,
    pub updated: i64,
    pub created: i64,
    pub project_id: String,
    pub directory: String,
}

pub fn parse_opencode_projects(output: &str) -> Result<Vec<OpenCodeProject>, String> {
    serde_json::from_str(output)
        .map_err(|error| format!("OpenCode 项目列表 JSON 不符合阶段 A 契约: {error}"))
}

pub fn parse_opencode_sessions(output: &str) -> Result<Vec<OpenCodeSession>, String> {
    serde_json::from_str(output)
        .map_err(|error| format!("OpenCode 会话列表 JSON 不符合阶段 A 契约: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn capability_manifests_capture_success_and_execution_failure() {
        let codex: CliCapabilityFixture = serde_json::from_str(include_str!(
            "../tests/fixtures/cli/codex-capabilities-2026-07-14.json"
        ))
        .expect("Codex capability fixture should parse");
        assert_eq!(codex.kind, CliKind::Codex);
        assert!(codex.cli_version.is_none());
        assert_eq!(codex.status, CliStatusState::Blocked);
        assert_eq!(codex.issue_code, Some(CliIssueCode::VersionCommandFailed));
        assert!(codex
            .probes
            .iter()
            .all(|probe| probe.status == CapabilityProbeStatus::Failed));

        let opencode: CliCapabilityFixture = serde_json::from_str(include_str!(
            "../tests/fixtures/cli/opencode-capabilities-1.17.20.json"
        ))
        .expect("OpenCode capability fixture should parse");
        assert_eq!(opencode.kind, CliKind::Opencode);
        assert_eq!(opencode.cli_version.as_deref(), Some("1.17.20"));
        assert_eq!(opencode.status, CliStatusState::Ready);
        assert_eq!(opencode.issue_code, None);
        assert!(opencode
            .probes
            .iter()
            .all(|probe| probe.status == CapabilityProbeStatus::Available));
    }

    #[test]
    fn opencode_debug_scrap_sample_matches_the_adapter_schema() {
        let projects = parse_opencode_projects(include_str!(
            "../tests/fixtures/cli/opencode-debug-scrap.sample.json"
        ))
        .expect("project sample should parse");
        assert_eq!(projects.len(), 1);
        assert_eq!(projects[0].worktree, r"C:\workspace\fixture-project");
    }

    #[test]
    fn opencode_session_list_sample_matches_the_adapter_schema() {
        let sessions = parse_opencode_sessions(include_str!(
            "../tests/fixtures/cli/opencode-session-list.sample.json"
        ))
        .expect("session sample should parse");
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].id, "ses_fixture");
    }

    #[test]
    fn checked_in_json_schemas_describe_array_outputs() {
        for schema in [
            include_str!("../tests/fixtures/cli/opencode-debug-scrap.schema.json"),
            include_str!("../tests/fixtures/cli/opencode-session-list.schema.json"),
        ] {
            let value: Value = serde_json::from_str(schema).expect("schema should be valid JSON");
            assert_eq!(value["type"], "array");
            assert!(value["items"]["required"].is_array());
        }
    }
}
