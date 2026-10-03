---
title: Space Plasma Notebook
description: A demonstration notebook connecting a simple electron-fluid model to plasma oscillations and explicit assumptions.
date: 2026-09-14
updated: 2026-09-28
status: Planning
tags: [Space Physics, Plasma Physics, Mathematical Models]
featured: true
demo: true
cover: /images/solar-study.svg
---

## Overview

This **Demo** develops a simple model, not a report of a performed research project. The goal is to make every approximation visible before moving to a numerical or observational study.

## Research question

What time scale controls the response of an electron plasma to a small density perturbation? Start with a homogeneous equilibrium, an immobile neutralizing ion background, electrostatic motion, and cold collisionless electrons.

## Method

Let $n_e=n_0+\delta n$, and linearize the one-dimensional continuity and momentum equations:

$$
\frac{\partial \delta n}{\partial t}+n_0\frac{\partial v}{\partial x}=0,
\qquad m_e\frac{\partial v}{\partial t}=-eE.
$$

Here $e>0$ is the elementary charge, so the electron charge is $-e$. Poisson's equation gives

$$
\frac{\partial E}{\partial x}=-\frac{e\,\delta n}{\epsilon_0}.
$$

Differentiate continuity once more in time and substitute momentum and Poisson:

$$
\frac{\partial^2\delta n}{\partial t^2}
=\frac{n_0e}{m_e}\frac{\partial E}{\partial x}
=-\omega_{pe}^2\delta n,
\qquad \omega_{pe}=\sqrt{\frac{n_0e^2}{\epsilon_0m_e}}.
$$

中文物理图像：电子发生微小位移后，电荷分离产生恢复电场；惯性使电子越过平衡位置，从而形成振荡。负号代表稳定的恢复作用。

### Dimensional and regime checks

The quantity $n_0e^2/(\epsilon_0m_e)$ has units $\mathrm{s}^{-2}$. The cold model predicts a frequency independent of wavenumber, but omits thermal pressure and kinetic effects. Ion motion, collisions, gradients, and magnetic forces may invalidate these assumptions.

## Planned experiment

A future numerical notebook could integrate a normalized harmonic oscillator and compare energy drift across time integrators. Any change in amplitude should first be checked against numerical error before being interpreted as physical damping.

## Results

The equations above are an educational derivation. No new scientific result, dataset, supervisor, or laboratory affiliation is implied.
