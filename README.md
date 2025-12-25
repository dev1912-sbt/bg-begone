# <img src="assets/favicon.svg" width="32" height="32" alt="Logo"> BackgroundBegone

A powerful, browser-based image background removal tool built with vanilla JavaScript and HTML5 Canvas.

## Features

* **Manual Brush**: Precise background erasure with adjustable size, feathering, and opacity.
* **Magic Wand**: Automatically select and remove areas of similar color with adjustable tolerance.
* **Refine Edge**: Smooth out rough edges and remove color spill for a professional finish.
* **History**: Robust Undo/Redo system to correct mistakes.
* **Zoom & Pan**: Easy navigation for detailed editing.
* **Privacy Focused**: All processing happens locally in your browser. No images are uploaded to any server.

## Getting Started

1. Clone the repository:

    ```bash
    git clone https://github.com/dev1912-sbt/bg-begone.git
    ```

2. Open `index.html` in your web browser. No build step or server required!

## Keyboard Shortcuts

| Key | Action |
| :--- | :--- |
| **B** | Switch to Manual Brush |
| **W** | Switch to Magic Wand |
| **R** | Switch to Refine Edge |
| **Space** | Hold to Pan |
| **Ctrl + Z** | Undo |
| **Ctrl + Y** | Redo |
| **F** | Adjust Size / Tolerance |
| **S** | Adjust Feather / Smoothness |
| **O** | Adjust Opacity |
| **Scroll** | Zoom In/Out |

## Technologies

* HTML5 Canvas API
* Vanilla JavaScript (ES6+)
* Tailwind CSS (via CDN)
* FontAwesome
