//! Which tools a `claude -p` call may use. The UI asks by id; this module decides.
//! See updates/2026-11-19 PATRONUS-WEB-TOOLS for the design and spike findings.

pub mod args;
pub mod commands;
pub mod registry;
