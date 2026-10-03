---
title: Electrodynamics
description: A demonstration SI-units reference for Maxwell equations, phasor signs, and plane-wave checks.
date: 2026-09-08
updated: 2026-09-29
category: Physics
semester: 2026 Fall
course: Electrodynamics
progress: 15
tags: [Physics, Electrodynamics, Mathematics, Course Notes]
featured: true
demo: true
attachments:
  - title: Demonstration archive handout
    url: /documents/demo-handout.pdf
    type: pdf
---

## Scope and conventions

This **Demo** is a reading-format example. It is not an official course handout or a completed course record. SI units are used; in the vacuum equations below $\epsilon_0$ and $\mu_0$ are constants.

## Maxwell equations

$$
\nabla\cdot\mathbf E=\frac{\rho}{\epsilon_0},\qquad
\nabla\cdot\mathbf B=0,
$$

$$
\nabla\times\mathbf E=-\frac{\partial\mathbf B}{\partial t},\qquad
\nabla\times\mathbf B=\mu_0\mathbf J+\mu_0\epsilon_0\frac{\partial\mathbf E}{\partial t}.
$$

对 Ampère–Maxwell 方程取散度，由 $\nabla\cdot(\nabla\times\mathbf B)=0$ 和 Gauss 定律得到

$$
\frac{\partial\rho}{\partial t}+\nabla\cdot\mathbf J=0.
$$

This is local charge conservation. The displacement-current term is essential when charge density changes in time.

## Phasor convention

Fix the convention before transforming time derivatives:

$$
\mathbf E(\mathbf r,t)=\operatorname{Re}\left[\widetilde{\mathbf E}(\mathbf r)e^{-i\omega t}\right].
$$

Then $\partial_t\mapsto-i\omega$, and

$$
\nabla\times\widetilde{\mathbf E}=i\omega\widetilde{\mathbf B},\qquad
\nabla\times\widetilde{\mathbf B}=\mu_0\widetilde{\mathbf J}-i\omega\mu_0\epsilon_0\widetilde{\mathbf E}.
$$

Changing to $e^{+i\omega t}$ changes these imaginary signs. Physical real fields are unchanged when the entire convention is transformed consistently.

## Plane-wave check

In a source-free homogeneous vacuum, take $\widetilde{\mathbf E}\propto e^{i\mathbf k\cdot\mathbf r}$. The curl equations imply

$$
\mathbf k\times\widetilde{\mathbf E}=\omega\widetilde{\mathbf B},\qquad
k^2=\mu_0\epsilon_0\omega^2,\qquad
\mathbf k\cdot\widetilde{\mathbf E}=0.
$$

Thus $c=1/\sqrt{\mu_0\epsilon_0}$ and $|\widetilde{\mathbf B}|=|\widetilde{\mathbf E}|/c$ for a plane wave. Check propagation direction with $\mathbf E\times\mathbf B$, not only by inspecting a complex exponential.

## Review questions

1. Derive charge conservation from Maxwell equations.
2. Explain why $\nabla\cdot\mathbf B=0$ alone does not imply $\mathbf B=0$.
3. Write the phasor curl equations using the opposite time convention and verify that a plane wave still propagates at $c$.

## Course archive

TODO: add actual lecture notes and homework discussions. Metadata, attachments, and references can be edited without changing page components.
