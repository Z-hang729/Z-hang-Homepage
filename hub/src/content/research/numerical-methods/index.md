---
title: Numerical Methods Laboratory
description: A demonstration study of stability, convergence, and reproducibility in a diffusion solver.
date: 2026-09-18
updated: 2026-09-25
status: Planning
tags: [Computational Physics, Python, Numerical Methods]
featured: true
demo: true
cover: /images/code-study.svg
---

## Overview

This **Demo** describes a small computational experiment that can later be replaced with actual work. It separates a discretization, a stability condition, and an accuracy test.

## Research question

How does the choice of grid spacing and time step affect an explicit solution of the one-dimensional diffusion equation?

$$
\frac{\partial u}{\partial t}=D\frac{\partial^2u}{\partial x^2},\qquad D>0.
$$

## Method

For a uniform grid, forward Euler in time and central differences in space give

$$
u_j^{n+1}=u_j^n+r(u_{j+1}^n-2u_j^n+u_{j-1}^n),
\qquad r=\frac{D\Delta t}{\Delta x^2}.
$$

A Fourier mode has amplification factor

$$
G=1-4r\sin^2\left(\frac{k\Delta x}{2}\right).
$$

Requiring $|G|\le 1$ for all modes gives $0\le r\le 1/2$ in this one-dimensional scheme. This bound changes for other dimensionalities or discretizations.

```python
import numpy as np

def periodic_diffusion_step(u, diffusivity, dx, dt):
    r = diffusivity * dt / dx**2
    if diffusivity < 0 or dx <= 0 or dt <= 0 or r > 0.5:
        raise ValueError("Require D >= 0, dx > 0, dt > 0, D*dt/dx**2 <= 0.5")
    return u + r * (np.roll(u, -1) - 2*u + np.roll(u, 1))
```

## Convergence experiment

For a periodic initial condition $u(x,0)=\sin(kx)$, the exact solution is $u(x,t)=e^{-Dk^2t}\sin(kx)$. Choose a domain containing an integer number of wavelengths; compare the numerical solution at the **same physical time** after refining the grid. The formal errors are $O(\Delta t)+O(\Delta x^2)$ for smooth solutions.

## Planned outputs

Archive the configuration, code version, boundary condition, error norm, and convergence table. 稳定性不等于准确性：即使程序不发散，也要检验误差随步长如何变化。

## Results and limitations

This template contains no measured convergence result. Explicit diffusion becomes expensive on fine grids because the allowable time step decreases as $\Delta x^2$.
