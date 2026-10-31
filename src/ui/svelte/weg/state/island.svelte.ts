let visible = $state(false);
let manuallyHidden = $state(false);

class IslandState {
  get visible() {
    return visible;
  }
  set visible(value: boolean) {
    visible = value;
  }

  get manuallyHidden() {
    return manuallyHidden;
  }

  hideManually() {
    manuallyHidden = true;
  }

  showManually() {
    manuallyHidden = false;
  }
}

export const islandState = new IslandState();
