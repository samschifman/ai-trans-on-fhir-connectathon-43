# Acme EarlyWarn Risk Model

> Synthetic connectathon model card. This document describes dummy test data and
> does not represent a production clinical model.

## Model identity

- **Model name:** Acme EarlyWarn Risk Model
- **Model version:** 1.4.0
- **Model role:** Clinical-monitoring and early-warning risk scoring
- **Provider:** Acme Clinical AI, Inc.
- **Related Device:** `Device/ai-device-3`

## Intended use

The model produces a structured risk score, risk category, and contributing
features from recent encounter history, active problems, vital signs, and
laboratory observations. It is intended to support review by trained
healthcare professionals. It is not intended to replace clinical judgment,
diagnosis, or treatment decisions.

## Training and evaluation data

This synthetic card does not claim a real training or evaluation dataset.
Connectathon resources are fictional and are used only to exercise FHIR
provenance, model-card, and transparency workflows.

## Limitations and risks

Risk estimates may be affected by missing, delayed, inaccurate, or
non-representative patient data. The score is not a clinical diagnosis and may
not generalize across populations, care settings, or workflows. A qualified
human must review the inputs and output before any action is taken.

## Oversight and change management

Deployments should record the device and version used for each AI-assisted
resource in FHIR Provenance. Changes to the model, feature preparation, or
thresholds should receive a new model-card version and be evaluated before
production use.
