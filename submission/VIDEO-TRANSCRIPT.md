# AutoSRE demo — recording transcript (~3 min)

Read the **SAY** lines out loud. Do the **DO** action, then keep talking over any
wait (the gate takes about 10 to 16 seconds to appear, narrate the detection while
it loads). Record on the live demo: https://autosre-ui-vrf7h4n4ra-uc.a.run.app/demo

Before you hit record: run one throwaway loop so the model is warm, set the browser
to 1440 wide, and reset to standby. Approve promptly when the gate shows so the
timer number stays tight.

---

### 1 (0:00)
**DO:** Open `/demo`. Dashboard is healthy ("All systems operational").
**SAY:** "When a checkout service goes down, the clock starts and money leaves with it. Most of that lost time is just figuring out what broke. Someone on call digs through dashboards and logs to find the one change that caused it. That can eat half an hour before anyone fixes a thing."

### 2 (0:15)
**DO:** Slowly pan across the three panels.
**SAY:** "This is AutoSRE. It watches a service through Dynatrace, finds what went wrong, and proposes a fix. Here is the part I care about most. It will not touch production on its own. It waits for me to say yes."

### 3 (0:35)
**DO:** Click **Run: Payment Errors**. Let the timeline fill while you talk.
**SAY:** "So let me break payments. A bad deploy switched on a feature flag that fails on some cards. Watch the agent pick it up. It pulls the open problem from Dynatrace, sees the failure rate sitting at twenty-two percent, checks the deploy and the flags, and it even looks at how we handled this kind of thing before."

### 4 (0:55) — the deny beat, lead with this
**DO:** When the approval card appears, click **Reject**.
**SAY:** "Here is the gate. The agent wants to disable that flag. First I am going to say no. Watch what it does. It stands down. Nothing changes, the incident stays open, and the refusal goes straight into the audit trail. The gate lives in the code, so the model cannot route around me. Almost nobody else will show you this."

### 5 (1:20)
**DO:** Click **Run Payment Errors Again**. When the gate shows, click **Approve**. Wait for the card to flip green.
**SAY:** "Now I run it again and approve. The flag flips off, the agent re-checks health through Dynatrace, and the incident clears. The timer up top shows two numbers. The agent reached its fix in about ten seconds. The total also counts the time I spent reading it. By hand, this is thirty minutes or more."

### 6 (1:45)
**DO:** Move the cursor to the Audit trail panel (both Approved and Rejected, with the Dynatrace badge).
**SAY:** "And here is the receipt. Both decisions, the approval and the refusal, are written down with who decided and what happened, and pushed back into the same Dynatrace tenant that caught the incident. So later, a compliance team can see exactly who said yes and why."

### 7 (2:10) — the real-tenant cut
**DO:** Cut to a terminal running the agent in `DYNATRACE_MCP_MODE=stdio` against the real tenant, where the DQL returns 22. (Repro steps are in `VIDEO-SCRIPT.md`.)
**SAY:** "What you are watching on the demo is the real Gemini 3 agent thinking, live. And against a real Dynatrace tenant, the same agent reads the real twenty-two percent spike from live telemetry over the official Dynatrace MCP server. We also score it. Across a set of incidents, including traps where the obvious fix is wrong, it chose the right action every time."

### 8 (2:35) — close
**DO:** Show the Stack ribbon (Gemini 3, Google ADK, Vertex AI and Cloud Run, Dynatrace MCP), then put the live URL and the GitHub link on screen.
**SAY:** "AutoSRE runs on Gemini 3 with Google Cloud Agent Builder, on Vertex AI and Cloud Run, with Dynatrace MCP for its senses. It does the slow detective work in seconds and leaves the decision, and the record of it, with me. That is the on-call engineer I would actually want at three in the morning. It is open source and live right now. Go break something and try it."
