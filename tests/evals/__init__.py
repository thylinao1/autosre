"""Diagnosis-quality eval harness for AutoSRE.

Measures what the agent PROPOSES at the gate (not what auto-approve forces),
across correct-fix and decoy incidents, scored for tool-selection accuracy and
false-action rate. See run_evals.py for the live runner and scorer.py for the
grading logic (graded against the target's own answer key, never shown to the
agent).
"""
