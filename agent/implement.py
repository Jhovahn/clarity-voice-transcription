"""Implementation stage of the agent pipeline (see DESIGN.md).

Runs after Gate 1 clears (the `agent:approved` label is applied, either by
triage self-clearing a trivial-risk ticket or by an authorized maintainer's
`/approve-plan` comment — see .github/workflows/agent-approve.yml). Edits
the checked-out working tree to implement the ticket. Never runs tests or
touches git/GitHub itself — those are deterministic workflow steps that act
on this script's output, same principle as triage.py's comment-posting.
"""

import asyncio
import os
import subprocess
import sys

from claude_agent_sdk import ClaudeAgentOptions, query
from claude_agent_sdk.types import AssistantMessage, TextBlock

SYSTEM_PROMPT = """You are implementing a GitHub issue in this repository, \
following a plan a maintainer has already approved (the issue's comments \
include the earlier triage comment with that plan). Make the smallest \
change that satisfies the issue and its approved plan — do not refactor, \
rename, or touch files outside what the plan describes.

Write or update tests alongside any behavior change. When you're done, \
reply with a short plain-text summary of what you changed and why, \
suitable for a pull request description. Do not include a diff — just the \
summary.
"""


def gh(*args: str) -> str:
    result = subprocess.run(
        ["gh", *args], capture_output=True, text=True, check=True
    )
    return result.stdout


async def implement(issue_number: str, repo_root: str) -> str:
    options = ClaudeAgentOptions(
        system_prompt=SYSTEM_PROMPT,
        allowed_tools=["Read", "Grep", "Glob", "Edit", "Write"],
        disallowed_tools=["Bash"],
        permission_mode="acceptEdits",
        cwd=repo_root,
    )

    issue_json = gh(
        "issue", "view", issue_number, "--json", "title,body,comments"
    )
    prompt = f"Implement this issue:\n\n{issue_json}"

    summary = ""
    async for message in query(prompt=prompt, options=options):
        if isinstance(message, AssistantMessage):
            for block in message.content:
                if isinstance(block, TextBlock):
                    summary = block.text
    return summary


def main() -> None:
    issue_number = os.environ["ISSUE_NUMBER"]
    repo_root = os.environ.get("REPO_ROOT", os.getcwd())
    summary_path = os.environ["SUMMARY_PATH"]

    summary = asyncio.run(implement(issue_number, repo_root))
    if not summary.strip():
        print("Implementation produced no summary", file=sys.stderr)
        sys.exit(1)

    with open(summary_path, "w") as f:
        f.write(summary)


if __name__ == "__main__":
    main()
