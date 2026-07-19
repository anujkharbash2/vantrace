from itertools import product
import random

def grid_search(search_space: dict) -> list[dict]:
    """Generate every combination of hyperparameters in the search space."""
    keys = list(search_space.keys())
    values = list(search_space.values())
    return [dict(zip(keys, combo)) for combo in product(*values)]

def random_search(search_space: dict, n: int) -> list[dict]:
    """Generate n randomly sampled hyperparameters from the search space."""
    configs = []
    for _ in range(n):
        one_config = {key: random.choice(values) for key, values in search_space.items()}
        configs.append(one_config)
    return configs

def run_sweep(configs: list[dict], train_fn) -> dict:
    """Run train_fn once per config, return the config with the highest score."""
    results = []
    for config in configs:
        score = train_fn(config)
        result = config.copy()
        result["score"] = score
        results.append(result)
    return max(results, key=lambda x: x["score"])