# AutoSRE demo video - recording script

The final video is three pieces, and two are already done or trivial:

1. **The terminal clip** - DONE, already recorded with its own narration.
2. **The main recording** - ONE continuous screen recording of your browser,
   you narrating, steps 1 to 9 below.
3. **The end card** - a title slide with the two links, added in the editor.

Assembly in the editor: play the main recording, cut it once at the marked
point after step 6, insert the terminal clip there (keep its audio), resume
the main recording, end card at the end. One cut, one insert. Done.

---

## Prep (10 minutes, before you hit record)

1. Browser at 1440 wide, bookmarks bar hidden, notifications off.
2. **Tab 1:** https://autosre-ui-vrf7h4n4ra-uc.a.run.app/demo
3. **Tab 2:** the Dynatrace Notebook "AutoSRE trust scorecard"
   (dkr99558.apps.dynatrace.com > Notebooks). Click Run once now to confirm it
   returns runs 25, falseActions 0, correct 25. Leave the tab open.
4. Warm-up on Tab 1: click **Run: Payment Errors**, wait for the gate, click
   **Reject**, then **Reset to Standby**. This makes your on-camera runs fast.
5. When you approve on camera, do it within 2-3 seconds so the timer number
   stays tight.

---

## The main recording - one continuous take

### Step 1
**DO:** Start recording. Tab 1, dashboard healthy ("All systems operational"). Hold still.
**SAY:** "When a checkout service goes down, the cost is immediate. Gartner's widely cited benchmark puts IT downtime at around $5,600 a minute, and more recent estimates run higher still. Most of that lost time goes to figuring out what broke. An on-call engineer works through dashboards and logs to find the one change that caused it, and that can take half an hour before anyone fixes a thing."

### Step 2
**DO:** Slowly pan the cursor across the three panels, then rest it for a second on the green **Evals: 0/25 false actions** chip in the header. Do not click it.
**SAY:** "This is AutoSRE. It watches a service through Dynatrace, finds what went wrong, and proposes a fix. Two things matter here. It will not touch production on its own; it waits for me to say yes. And it is graded. That green chip in the header is a real scorecard, and we will come back to it."

### Step 3
**DO:** Click **Run: Payment Errors**. Talk while the timeline fills.
**SAY:** "Now I will break payment processing on purpose. A bad deploy switched on a feature flag that fails on some cards. Watch the agent pick it up. It pulls the problem from Dynatrace, sees the failure rate sitting at twenty-two percent, checks the deploy and the flags, and reviews how similar incidents were handled before."

### Step 4
**DO:** When the approval card appears, pause one second so the viewer can read it, then click **Reject**.
**SAY:** "Here is the gate. The agent wants to disable that flag. First, I am going to say no. Watch what it does. It stands down. Nothing changes, the incident stays open, and the refusal goes straight into the audit trail. The gate is enforced in the code, so the model cannot route around me. Very few demos will show you this moment."

### Step 5
**DO:** Click **Run Payment Errors Again**. When the gate shows, click **Approve** within 2-3 seconds. Wait for the card to flip green.
**SAY:** "Now I run it again and approve. The flag is disabled, the agent re-checks health through Dynatrace, and the incident clears. The timer at the top shows two numbers. The agent reached its proposed fix in about ten seconds; the total also counts the time I spent reviewing it. Done manually, this takes thirty minutes or more."

### Step 6
**DO:** Move the cursor to the **Audit trail** panel (Approved and Rejected entries, Dynatrace badge).
**SAY:** "And here is the record. Both decisions, the approval and the refusal, are written down with who decided and what happened, then pushed back into the same Dynatrace tenant that caught the incident. Keep that in mind; it will matter again in a moment. A compliance team can see exactly who said yes, and why."

> ✂️ **EDITOR MARK: cut here. Insert the terminal clip (it has its own audio). Then resume.**

### Step 7
**DO:** Click the **Evals: 0/25 false actions** chip. The scorecard page opens. Rest on the stat cards and the highlighted trap line.
**SAY:** "Before you trust an agent, grade it. We ran twenty-five scored incidents past this one, including decoys where the obvious fix is wrong, and a trap where nothing is broken at all. Twenty-five out of twenty-five correct. Zero false actions. It refused the trap all five times. The most dangerous agent is one that acts when it should not. This one knows when to do nothing."

### Step 8
**DO:** Switch to **Tab 2** (the Dynatrace Notebook). Click **Run**. The result row appears: runs 25, falseActions 0, correct 25.
**SAY:** "And that report card does not live on our website. It lives in Dynatrace, next to every approval and every refusal. The platform that watches production now watches the agent, and its track record can be queried like any other telemetry."

### Step 9
**DO:** Switch back to **Tab 1** (the resolved green board, frozen timer). Hold it through the lines, then one second of silence, then stop recording.
**SAY:** "So that's the whole system. It does the slow investigation work in seconds, it asks before it touches anything, and when I said no earlier, it actually stopped. All of those decisions are now sitting in Dynatrace, where anyone can go back and check them later. For me, that's really what I'd want from something on call at three in the morning. It's open source and running live right now, so you're welcome to go try it yourself and see how it behaves."

---

## In the editor (15 minutes)

1. Cut the main recording at the editor mark after step 6; insert the terminal
   clip; trim its start to the "Initializing Dynatrace MCP Server" line and its
   end to the RECOVERED report.
2. End card after step 9: the live demo URL and the GitHub repo, with one small
   line under them: "Gemini 3 · Google ADK / Agent Builder · Vertex AI · Cloud Run · Dynatrace MCP · MIT".
3. Watch it once muted. If the reject moment and the 25/25 scorecard still land
   with no sound, you are done. Target length about three minutes; if you are
   over, trim silences, not sentences.
