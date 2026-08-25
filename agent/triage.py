"""Triage stage of the agent pipeline (see DESIGN.md).

Reads a newly opened GitHub issue, explores the repo read-only, and posts a
structured plan + risk rating back as a comment. Never writes or edits any
code — that only happens after a human approves the plan (Gate 1), in a
later stage not built yet.
"""

import asyncio
import os
import subprocess
import sys

from claude_agent_sdk import ClaudeAgentOptions, query
from claude_agent_sdk.types import AssistantMessage, TextBlock

SYSTEM_PROMPT = """You are triaging a GitHub issue in this repository, on \
its way to becoming a pull request. You do NOT write or edit any code in \
this step — you only read the codebase to understand scope.

Explore the repository as needed using Read and Grep, then reply with a \
single comment in exactly this structure:

## Understanding
Restate the ask in your own words. If it's genuinely ambiguous, say what's \
unclear instead of guessing, and stop there.

## Affected files
List the files/areas you expect this to touch.

## Plan
A short numbered plan for the implementation.

## Risk: trivial | standard | sensitive
One line justifying the rating. `trivial` means something like a typo, a \
copy change, or a one-line config fix. `sensitive` means it touches auth, \
payments, data deletion, or anything hard to reverse. Everything else is \
`standard`.

## Next step
If risk is `trivial`, say implementation can proceed directly. Otherwise, \
say this is waiting on a maintainer to comment `/approve-plan`.
"""


def gh(*args: str) -> str:
    result = subprocess.run(
        ["gh", *args], capture_output=True, text=True, check=True
    )
    return result.stdout


async def triage(issue_number: str, repo_root: str) -> str:
    options = ClaudeAgentOptions(
        system_prompt=SYSTEM_PROMPT,
        # Read-only tools, and "plan" mode as a second layer that blocks
        # any mutating tool use at the harness level regardless of what
        # the model asks for — mirrors the plan/approve gate this whole
        # pipeline is built around.
        allowed_tools=["Read", "Grep", "Glob"],
        disallowed_tools=["Bash", "Write", "Edit"],
        permission_mode="plan",
        cwd=repo_root,
    )

    issue_json = gh("issue", "view", issue_number, "--json", "title,body")
    prompt = f"Triage this issue:\n\n{issue_json}"

    final_text = ""
    async for message in query(prompt=prompt, options=options):
        if isinstance(message, AssistantMessage):
            for block in message.content:
                if isinstance(block, TextBlock):
                    final_text = block.text
    return final_text


def main() -> None:
    issue_number = os.environ["ISSUE_NUMBER"]
    repo_root = os.environ.get("REPO_ROOT", os.getcwd())

    comment = asyncio.run(triage(issue_number, repo_root))
    if not comment.strip():
        print("Triage produced no output", file=sys.stderr)
        sys.exit(1)

    gh("issue", "comment", issue_number, "--body", comment)


if __name__ == "__main__":
    main()
