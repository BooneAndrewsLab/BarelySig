#!/usr/bin/env python3
"""Reference figures for design note 05: the app's example data drawn by
seaborn in the style BarelySig's "Modern" theme follows ("ticks",
colour-blind palette, despined). Run with a Python that has seaborn,
e.g. ~/Programs/miniconda3/envs/cluster/bin/python.
"""
import os

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import pandas as pd  # noqa: E402
import seaborn as sns  # noqa: E402

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "../docs/design/05")
MM = 1 / 25.4

data = {
    "Vehicle": [98.2, 101.5, 99.1, 97.8, 102.3, 100.4],
    "Drug 1 µM": [91.7, 88.4, 93.0, 90.2, 86.9],
    "Drug 10 µM": [62.3, 58.1, 65.7, 60.9, 55.4, 63.2],
}
df = pd.DataFrame([(g, v) for g, vs in data.items() for v in vs], columns=["group", "value"])

sns.set_theme(style="ticks", context="paper", palette="colorblind", rc={"font.size": 7, "axes.labelsize": 8})


def save(fig, name):
    sns.despine(fig=fig)
    fig.tight_layout()
    fig.savefig(os.path.join(OUT, f"{name}.png"), dpi=300)
    plt.close(fig)


fig, ax = plt.subplots(figsize=(70 * MM, 60 * MM))
sns.barplot(df, x="group", y="value", hue="group", errorbar="sd", capsize=0.2, err_kws={"linewidth": 0.8}, ax=ax)
sns.stripplot(df, x="group", y="value", color="black", size=3, alpha=0.6, jitter=0.15, ax=ax)
ax.set(xlabel="", ylabel="Viability (%)")
save(fig, "seaborn-bar-points")

fig, ax = plt.subplots(figsize=(70 * MM, 60 * MM))
sns.swarmplot(df, x="group", y="value", hue="group", size=4, ax=ax)
sns.pointplot(df, x="group", y="value", errorbar="sd", color="black", linestyle="none", marker="_", markersize=14, capsize=0.15, err_kws={"linewidth": 0.8}, ax=ax)
ax.set(xlabel="", ylabel="Viability (%)")
save(fig, "seaborn-swarm")
