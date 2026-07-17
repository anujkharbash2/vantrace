import time
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import DataLoader
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
    total_loss, correct, total = 0.0, 0, 0
    with torch.no_grad():
        for data, target in loader:
            data, target = data.to(device), target.to(device)
            output = model(data)
            total_loss += F.cross_entropy(output, target, reduction="sum").item()
            pred = output.argmax(dim=1)
            correct += (pred == target).sum().item()
            total += target.size(0)
    return total_loss / total, correct / total


def main():
    device = torch.device("mps" if torch.backends.mps.is_available() else "cpu")

    config = {
        "lr": 0.001,
        "batch_size": 64,
        "epochs": 3,
        "optimizer": "adam",
        "model": "SmallCNN",
    }

    run = vantrace.init(project="mnist-cnn", name="smallcnn-baseline", config=config)

    transform = transforms.Compose([transforms.ToTensor()])
    train_set = datasets.MNIST(root="./data", train=True, download=True, transform=transform)
    val_set = datasets.MNIST(root="./data", train=False, download=True, transform=transform)

    train_loader = DataLoader(train_set, batch_size=config["batch_size"], shuffle=True)
    val_loader = DataLoader(val_set, batch_size=256, shuffle=False)

    model = SmallCNN().to(device)
    optimizer = torch.optim.Adam(model.parameters(), lr=config["lr"])

    global_step = 0
    print(f"Training on {device}. Open the dashboard and watch it live.")

    for epoch in range(config["epochs"]):
        model.train()
        for batch_idx, (data, target) in enumerate(train_loader):
            data, target = data.to(device), target.to(device)

            optimizer.zero_grad()
            output = model(data)
            loss = F.cross_entropy(output, target)
            loss.backward()
            optimizer.step()

            global_step += 1

            # high-frequency logging every 50 batches — stress-tests ingestion
            if batch_idx % 50 == 0:
                vantrace.log({"train_loss": loss.item()}, step=global_step)

        val_loss, val_acc = evaluate(model, val_loader, device)
        vantrace.log({"val_loss": val_loss, "val_accuracy": val_acc}, step=global_step)
        print(f"epoch {epoch+1}/{config['epochs']} — val_loss={val_loss:.4f} val_acc={val_acc:.4f}")

    vantrace.finish()
    print("Training finished.")


if __name__ == "__main__":
    main()