import vantrace
import random
import time

run = vantrace.init(project="mnist-test", config={"lr": 0.001, "epochs": 5})

for step in range(20):
    vantrace.log({"loss": random.random(), "accuracy": step / 20})
    time.sleep(0.05)

vantrace.finish()