(function attachPolicy(root) {
  const policy = {
  "metadata": {
    "algorithm": "chance-sampled MCCFR",
    "game": "heads-up abstract no-limit betting subgame",
    "iterations": 320000,
    "buckets": 5,
    "generatedAt": "2026-08-19T12:11:49.720Z"
  },
  "open": {
    "0": {
      "check": 0.785516,
      "bet_small": 0.086667,
      "bet_large": 0.127818
    },
    "1": {
      "check": 0.99576,
      "bet_small": 0.000256,
      "bet_large": 0.003984
    },
    "2": {
      "check": 0.992615,
      "bet_small": 0.004512,
      "bet_large": 0.002873
    },
    "3": {
      "check": 0.846631,
      "bet_small": 0.145082,
      "bet_large": 0.008287
    },
    "4": {
      "check": 0.631696,
      "bet_small": 0.132574,
      "bet_large": 0.23573
    }
  },
  "facing": {
    "low": {
      "0": {
        "fold": 0.662257,
        "call": 0.000032,
        "raise": 0.337711
      },
      "1": {
        "fold": 0.000021,
        "call": 0.998293,
        "raise": 0.001687
      },
      "2": {
        "fold": 0.000021,
        "call": 0.999493,
        "raise": 0.000486
      },
      "3": {
        "fold": 0.000021,
        "call": 0.974149,
        "raise": 0.02583
      },
      "4": {
        "fold": 0.000021,
        "call": 0.000098,
        "raise": 0.999881
      }
    },
    "medium": {
      "0": {
        "fold": 0.998061,
        "call": 0.000021,
        "raise": 0.001919
      },
      "1": {
        "fold": 0.595788,
        "call": 0.011987,
        "raise": 0.392225
      },
      "2": {
        "fold": 0.000021,
        "call": 0.999695,
        "raise": 0.000283
      },
      "3": {
        "fold": 0.000021,
        "call": 0.976506,
        "raise": 0.023473
      },
      "4": {
        "fold": 0.000021,
        "call": 0.000046,
        "raise": 0.999933
      }
    },
    "high": {
      "0": {
        "fold": 0.938502,
        "call": 0.000021,
        "raise": 0.061476
      },
      "1": {
        "fold": 0.649235,
        "call": 0.000021,
        "raise": 0.350744
      },
      "2": {
        "fold": 0.000569,
        "call": 0.978332,
        "raise": 0.021099
      },
      "3": {
        "fold": 0.000029,
        "call": 0.999272,
        "raise": 0.000699
      },
      "4": {
        "fold": 0.000021,
        "call": 0.000076,
        "raise": 0.999904
      }
    }
  }
};
  if (typeof module !== 'undefined' && module.exports) module.exports = policy;
  if (root) root.MCCFR_POLICY = policy;
})(typeof window !== 'undefined' ? window : globalThis);
