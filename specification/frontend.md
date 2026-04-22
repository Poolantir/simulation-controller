# Front-End
Front-end should mirror the image in the figma sketch: 
<p align="center">
  <img src="../img/poolantir-frontend-figma-sketch.png" alt="Figma sketch" width="75%" />
  <br />
  <em>Figma sketch</em>
</p>

## Core Design Principles:
1. Material UI: use all mui components when applicable (dropdown, textfield, etc). Only use icons when specified.
2. Theme: 
    - Gray: #DFDFDF
    - Dark Brown: #4B382E
    - Light Brown: #C0A300
    - Yellow: #FFE96D
3. Front-end/Backend communication - this application uses Flask. Write all non-ui core logic using python.

## Components
### Header
<p align="center">
  <img src="../img/header-component.png" alt="Header component" width="75%" />
  <br />
  <em>Header component</em>
</p>

The header component is simply a 82 height Gray line placed at the top of the screen. Centered in this div is a flexbox containing the poolantir-simulation-logo.svg
There header serves no functionality.

### Sidebar
<p align="center">
  <img src="../img/sidebar-component.png" alt="Sidebar component" width="75%" />
  <br />
  <em>Sidebar component</em>
</p>

The sidebar component holds the configuration settings and simulation log for the poolantir simulation. This is a vertical flexbox, containing 3 _sidebar squares_.
1. Simulation Configuration (size: 40%)
2. Restroom Conditions (size: 40%)
3. Simulation Logs (size: 20%, ability to fullscreen logs) 

### Simulation Control Buttons 
<p align="center">
  <img src="../img/simulation-control-buttons-component.png" alt="Simulation control buttons" width="75%" />
  <br />
  <em>Simulation control buttons</em>
</p>

This is a simple flexbox containing 4 actions for the simulation
- start: green (mui start icon)
- pause: gray (mui pause icon)
- stop: red (mui stop icon)
- replay: blue (mui refresh icon)

these each have a slightly darker text and border than their background, and have 8px rounded borders.

### Sidebar Squares
<p align="center">
  <img src="../img/sidebar-square-component.png" alt="Sidebar square component" width="45%" style="display:inline-block; vertical-align:top; margin-right:2%;" />
  <img src="../img/sidebar-square-component-example.png" alt="Example sidebar square component" width="45%" style="display:inline-block; vertical-align:top;" />
  <br />
  <em>Sidebar square component (left) &nbsp;&nbsp; | &nbsp;&nbsp; Example sidebar square (right)</em>
</p>

The sidebar square component is a simple square that encapsulates part of the logic of the simulation. This fits within the larger sidebar component. 
Please note that the "Simulation Configuration" internal contents should be removed. For now, leave this sidebar square blank.

### Queue
<p align="center">
  <img src="../img/queue-component.png" alt="Queue component" width="75%" />
  <br />
  <em>Queue component</em>
</p>

The queue compoent has two functionalities:
1. represents the current queue of the restroom
2. allows users to add users (pee/poo) to the queue for processing by the scheduler

### Usage Percentage Square
<p align="center">
  <img src="../img/usage-percentage-square-component.png" alt="Usage percentage square" width="75%" />
  <br />
  <em>Usage percentage square</em>
</p>

simple square that reflects the current usage percentage for the current simulation's run.
- w: 145px
- h: 145px
- background: gray
- all borders rounded 10px

### Stall
<p align="center">
  <img src="../img/stall-component.png" alt="Stall component" width="45%" style="display:inline-block; vertical-align:top; margin-right:2%;" />
  <img src="../img/stall-component-figma.png" alt="Stall component (Figma)" width="45%" style="display:inline-block; vertical-align:top;" />
  <br />
  <em>Stall component (left) &nbsp;&nbsp; | &nbsp;&nbsp; Stall component — Figma (right)</em>
</p>

The stall is created by using 4 shapes:
1. horizontal-rectangle-HANDLE:
- w: 26px
- h: 6.5px
- background: gray

2. rounded-square-BOWL: 
- w: 66px
- h: 66 px
- background: white
- all corners rounded 25px

3. top-left-bottom-left-rectangle-BASE: 
- w: 75px
- h: 85px
- background: white
- stroke: 7px black
- topleft & bottomleft rounded 30

4. vertical-rectangle-TOP: 
- w: 37px
- h: 123px
- background: white
- stroke: 7px black
- all corners rounded 10px

5. node-id:
- font-size: 24px
- color: black

This can be created with a few flex boxes:
main container: flex-row
- left container: 
    all three components are stacked both horizontally and vertically ontop of eachother:
    - node id
    - rounded-square-BOWL 
    - top-left-bottom-left-rectangle-BASE
- right container:
    - sub-container: flex-column, justify-content: start ,align-items: start
        - horizontal-rectangle-HANDLE
        - vertical-rectangle-TOP

### Stall Container
<p align="center">
  <img src="../img/stall-container-component.png" alt="Stall container component" width="75%" />
  <br />
  <em>Stall container component</em>
</p>

The stall container component can be created as follows:

horizontal flexbox:
    - left: vertical flexbox:
        - stall component
        - horizontal line: 380px
    - right: usage percentage sqaure

this entire component should be 525px wide:
- 380 coming from stall and horizontal line flex box
- 145 coming from the usage percentage square

the component height should be 155:
- 145 for usage percentage square
- 10 padding from bottom for usage percentage square

### Urinal 
<p align="center">
  <img src="../img/urinal-component.png" alt="Urinal component" width="45%" style="display:inline-block; vertical-align:top; margin-right:2%;" />
  <img src="../img/urinal-component-figma.png" alt="Urinal component (Figma)" width="45%" style="display:inline-block; vertical-align:top;" />
  <br />
  <em>Urinal component (left) &nbsp;&nbsp; | &nbsp;&nbsp; Urinal component — Figma (right)</em>
</p>

The urinal component is created using 2 rectangles:
1. top-left-bottom-left-rounded-vertical-rectangle-BOWL:
- w: 26px
- h: 98px
- background: white
- stroke: 7px black
- top left and bottom left corners rounded 25px

2. rounded-vertical-rectangle-BASE:
- w: 43px
- h: 114.22px
- background: white
- stroke: 7px black
- all corners rounded 10px

### Urinal Container
<p align="center">
  <img src="../img/urinal-container-component.png" alt="Urinal container component" width="75%" />
  <br />
  <em>Urinal container component</em>
</p>

The urinal container component can be created as follows:

horizontal flexbox:
    - left: vertical flexbox:
        - urinal component
        - horizontal line: 200px
    - right: usage percentage square

this entire component should be 525px wide:
- 380 coming from urinal and horizontal line flex box
- 145 coming from the usage percentage square

the component height should be 155:
- 145 for usage percentage square
- 10 padding from bottom for usage percentage square


### Simulation Elapsed Time
<p align="center">
  <img src="../img/simulation-time-elapsed-component.png" alt="Simulation elapsed time" width="75%" />
  <br />
  <em>Simulation elapsed time</em>
</p>

This is a simple text field that shows the current elapsed time of the simualation
- font-size: 24px
- color: black

### Simulation Digital Twin
<p align="center">
  <img src="../img/simulation-digital-twin.png" alt="Simulation digital twin" width="75%" />
  <br />
  <em>Simulation digital twin</em>
</p>

The simulation digital twin is a container that hold:
1. queue (placed at the left start)
2. toilets & percent usage (placed end right)
