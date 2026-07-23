# Specification: Decoupled Spatial Navigation System for Phaser 3

## 1. System Overview & Architecture Goals
Design and implement a framework-agnostic, decoupled **Spatial Navigation System** for Phaser 3 using TypeScript. 
The system decouples UI layout and visual rendering from navigation routing using **On-Demand Geometric Calculation** and **Self-Registration Pattern**.

### Core Architecture Principles:
1. **Zero-Mapping Topography**: Do NOT use hardcoded neighbor maps (`upId`, `leftId`). Target selection must be determined dynamically based on runtime geometric bounds.
2. **Decoupled Logic & Render**: The navigation engine strictly manages active focus state. Visual components consume the state independently.
3. **Scope Hierarchy & Stack**: Focusable modules belong to a `FocusScope` (e.g., Menu, Modal, Inventory). Scopes are managed via a Stack for Modal overlays.
4. **Resilient to Transitions**: Seamlessly handle micro-floating UI (ambient animations) while offering transition locks for macro layout shifts.

---

## 2. Domain Models & Interfaces

```typescript
export type Direction = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';

export enum ScopeState {
  INACTIVE = 'INACTIVE',
  ACTIVE = 'ACTIVE',
  TRANSITIONING = 'TRANSITIONING', // Input locked during major transitions
}

export interface Point2D {
  x: number;
  y: number;
}

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
  center: Point2D;
}

export interface IFocusable {
  readonly id: string;
  readonly scopeId: string;
  readonly isEnabled: boolean;
  getBounds(): Bounds;
  onFocus(): void;
  onBlur(): void;
  onSelect(): void;
}

export interface ScopeBoundaryOverride {
  UP?: string | (() => void);
  DOWN?: string | (() => void);
  LEFT?: string | (() => void);
  RIGHT?: string | (() => void);
}

```

---

## 3. Core Component Specifications

### A. `FocusModule` (Self-Registering Entity)

* **Lifecycle**:
* `constructor`: Attaches to a Phaser GameObject (`Phaser.GameObjects.GameObject`).
* Listen to Phaser's `Phaser.GameObjects.Events.DESTROY` event to automatically unregister itself from `FocusRouter`.


* **Geometric Boundary**:
* `getBounds()` MUST return absolute screen coordinates using Phaser's native `gameObject.getBounds()`.
* Calculate `center` point as `(x + width / 2, y + height / 2)`.



### B. `FocusScope` (Group & Boundary Container)

* **State Management**:
* Maintains `ScopeState` (`INACTIVE`, `ACTIVE`, `TRANSITIONING`).
* Maintains `lastFocusedId: string | null` for **Focus Memory**.


* **Boundary Handling**:
* Supports `boundaryOverride?: ScopeBoundaryOverride` to handle custom cross-menu bridges or fallback callbacks when navigation hits an edge.



### C. `FocusRouter` (Singleton Navigation Engine)

* **Scope Stack**:
* `pushScope(scopeId: string)`: Suspends current scope, activates target scope.
* `popScope()`: Deactivates top scope, restores state and focus of the underlying scope.


* **Input Throttle**:
* Implements an input cooldown timer (default: `120ms`) to prevent input spam during key holding.



---

## 4. Navigation & Spatial Routing Algorithm

When a direction input (`dir`) is received, `FocusRouter` calculates the next target in `activeScope`:

### Algorithm Steps:

1. **State Lock Check**: If current `FocusScope.state !== ScopeState.ACTIVE`, ignore input.
2. **Candidate Filtering (Half-Space Projection)**:
* Calculate origin point $P_{origin}$ from currently focused item's `Bounds.center`.
* Filter out candidate items based on `dir`:
* `RIGHT`: Candidate $X_{center} > P_{origin}.x$
* `LEFT`: Candidate $X_{center} < P_{origin}.x$
* `DOWN`: Candidate $Y_{center} > P_{origin}.y$
* `UP`: Candidate $Y_{center} < P_{origin}.y$




3. **Weighted Distance Scoring**:
* For all filtered candidates, compute score $S$:

$$\Delta x = |X_{candidate} - P_{origin}.x|$$


$$\Delta y = |Y_{candidate} - P_{origin}.y|$$


* If `dir` is `LEFT` or `RIGHT`:

$$S = \Delta x + (\lambda \cdot \Delta y)$$


* If `dir` is `UP` or `DOWN`:

$$S = \Delta y + (\lambda \cdot \Delta x)$$


* **Penalty Multiplier**: Set $\lambda = 2.5$ to heavily penalize off-axis candidates.


4. **Target Resolution & Fallback**:
* Select candidate with the **lowest score $S$**.
* If candidate set is empty, trigger `FocusScope.boundaryOverride[dir]`.



---

## 5. Edge Case Handling Rules

1. **Ambient Floating Animations (Idle Tweens)**:
* Do NOT lock input during micro-floating or breathing animations. The geometric scoring tolerance natively accommodates small position variations.


2. **Transition Locks**:
* Set `FocusScope.state = ScopeState.TRANSITIONING` when starting major entrance/exit Tweens.
* Set to `ScopeState.ACTIVE` in `tween.onComplete()`.


3. **Pagination & Viewport Masking**:
* Inactive pages must NOT be instantiated or registered in `FocusRouter`.
* Page flips should deactivate/destroy old `FocusModule` instances and register new page items upon creation.


4. **Focus Loss Safety (Fallback)**:
* If current focus item is destroyed or disabled, automatically fallback to `FocusScope.lastFocusedId` or the first available `IFocusable` in the active scope.



---

## 6. Verification & Implementation Checklist

* [ ] **Type Definitions**: Export all interfaces (`IFocusable`, `Bounds`, `Direction`, `ScopeState`).
* [ ] **FocusModule Decorator/Mixin**: Provide a clean wrapper for Phaser GameObjects.
* [ ] **Router Vector Math**: Implement half-space filter & weighted scoring equation.
* [ ] **Scope Stack**: Test `pushScope` / `popScope` lifecycle with overlay modals.
* [ ] **Unit Tests / Demo Scene**: Create a mock Phaser scene containing:
* Floating buttons (confirm math resilience).
* Two distinct menus with an explicit boundary override bridge.
* A modal pop-up demonstrating Scope Stack focus retention.

