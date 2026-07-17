import vantrace
import math
import random
import time

run = vantrace.init(
    project="live-demo",
    name="resnet-sim",
    config={"lr": 0.001, "epochs": 50, "batch_size": 32},
)

print("Training started — open the dashboard and watch it update live.")

for step in range(50):
    loss = max(0.05, 2.0 * math.exp(-step / 15) + random.uniform(-0.05, 0.05))
    accuracy = min(0.99, step / 55 + random.uniform(-0.02, 0.02))
    vantrace.log({"loss": loss, "accuracy": accuracy})
    time.sleep(1)  # simulate real training step time

vantrace.finish()
print("Training finished.")