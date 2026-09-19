# Acme Clinical Text Foundation Model

> Synthetic connectathon model card. This document describes dummy test data and
> does not represent a production clinical model.

## Model identity

- **Model family:** Acme Clinical Text Foundation Model
- **Model role:** Shared language model used by the ScribeAssist LLM and
  TextXtract NLP Pipeline devices
- **Model-card version:** 1.0.0
- **Provider:** Acme Clinical AI, Inc.
- **Related Devices:** `Device/ai-device-1` and `Device/ai-device-2`

## Intended use

The model supports clinical-document summarization and extraction of explicitly
stated observations, allergy information, and medication information from
clinical text. It is intended to assist trained healthcare professionals and
data-processing workflows. It is not intended to diagnose, triage, prescribe,
or make autonomous clinical decisions.

## Training and evaluation data

This synthetic card does not claim a real training or evaluation dataset.
Connectathon resources are fictional and are used only to exercise FHIR
provenance, model-card, and transparency workflows.

## Limitations and risks

The model may omit, misinterpret, or incorrectly structure information from
clinical text. Performance may vary with writing style, specialty, language,
abbreviations, and missing context. Outputs require review by a qualified
human before clinical use, and generated content must not be treated as an
independent source of truth.

## Oversight and change management

Deployments should record the device and version used for each AI-assisted
resource in FHIR Provenance. Changes to the underlying model, prompts, or
processing pipeline should receive a new model-card version and be evaluated
before production use.
