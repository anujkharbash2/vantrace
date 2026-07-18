import functools
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import DataLoader
from vantrace.sweep import grid_search, run_sweep
from torchvision import datasets, transforms


import vantrace


class SmallCNN(nn.Module):
    def __init__(self):
        super().__init__()
        self.conv1 = nn.Conv2d(1, 16, 3, padding=1)
        self.conv2 = nn.Conv2d(16, 32, 3, padding=1)
        self.pool = nn.MaxPool2d(2, 2)
        self.fc1 = nn.Linear(32 * 7 * 7, 128)
        self.fc2 = nn.Linear(128, 10)

    def forward(self, x):
        x = self.pool(F.relu(self.conv1(x)))
        x = self.pool(F.relu(self.conv2(x)))
        x = x.view(x.size(0), -1)
        x = F.relu(self.fc1(x))
        return self.fc2(x)


def evaluate(model, loader, device):
    model.eval()
    correct, total = 0, 0
    with torch.no_grad():
        for data, target in loader:
            data, target = data.to(device), target.to(device)
            pred = model(data).argmax(dim=1)
            correct += (pred == target).sum().item()
            total += target.size(0)
    return correct / total




def train_fn(config: dict, device, train_set, val_set) -> float:
    run = vantrace.init(project="mnist-sweep", config=config)

    train_loader = DataLoader(train_set, batch_size=config["batch_size"], shuffle=True)
    val_loader = DataLoader(val_set, batch_size=256, shuffle=False)

    model = SmallCNN().to(device)
    optimizer = torch.optim.Adam(model.parameters(), lr=config["lr"])

    step = 0
    epochs = 2
    val_acc = 0.0

    for epoch in range(epochs):
        model.train()
        for batch_idx, (data, target) in enumerate(train_loader):
            data, target = data.to(device), target.to(device)
            optimizer.zero_grad()
            loss = F.cross_entropy(model(data), target)
            loss.backward()
            optimizer.step()
            step += 1
            if batch_idx % 100 == 0:
                vantrace.log({"train_loss": loss.item()}, step=step)

        val_acc = evaluate(model, val_loader, device)
        vantrace.log({"val_accuracy": val_acc}, step=step)
        print(f"  [{run.id}] epoch {epoch+1}/{epochs} lr={config['lr']} batch_size={config['batch_size']} val_acc={val_acc:.4f}")

    vantrace.finish()
    return val_acc


def main():
    device = torch.device("mps" if torch.backends.mps.is_available() else "cpu")

    transform = transforms.Compose([transforms.ToTensor()])
    train_set = datasets.MNIST(root="./data", train=True, download=True, transform=transform)
    val_set = datasets.MNIST(root="./data", train=False, download=True, transform=transform)

    search_space = {
        "lr": [0.01, 0.001],
        "batch_size": [32, 64],
    }
    configs = grid_search(search_space)
    print(f"Running sweep over {len(configs)} configs...\n")

    bound_train_fn = functools.partial(
        train_fn, device=device, train_set=train_set, val_set=val_set
    )

    best = run_sweep(configs, bound_train_fn)

    print(f"\n=== Best config ===\n{best}")


if __name__ == "__main__":
    main()