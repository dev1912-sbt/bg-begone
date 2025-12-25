const App = {
    canvas: document.getElementById('editorCanvas'),
    ctx: document.getElementById('editorCanvas').getContext('2d', { willReadFrequently: true }),
    viewport: document.getElementById('viewport'),
    bgLayer: document.getElementById('bg-layer'),
    
    img: null,
    originalImageData: null,
    history: [],
    historyIndex: -1,
    maxHistoryStates: 50,
    scale: 1,
    panning: false,
    panStart: { x: 0, y: 0 },
    offset: { x: 0, y: 0 },
    isDrawing: false,
    isSpacePressed: false,
    currentTool: 'manual',
    
    activeMagicWand: null,
    debounceTimer: null,

    brushPreviewTimeout: null,

    settings: {
        brushSize: 50,
        brushFeather: 0.5,
        brushOpacity: 1,
        magicTolerance: 20,
        magicOpacity: 1,
        magicSmoothness: 0
    },

    init() {
        const savedLimit = localStorage.getItem('bgRemover_maxHistory');
        if (savedLimit) {
            this.maxHistoryStates = parseInt(savedLimit);
        }

        this.bindEvents();
        this.initTooltips();
        this.updateUI();
        this.toggleTools('manual');
    },

    bindEvents() {
        document.getElementById('imageInput').addEventListener('change', (e) => this.handleImageUpload(e));
        document.getElementById('downloadBtn').addEventListener('click', () => this.downloadImage());
        
        // Settings Modal
        const settingsModal = document.getElementById('settingsModal');
        const historyInput = document.getElementById('historyLimitInput');

        document.getElementById('settingsBtn').addEventListener('click', () => {
            historyInput.value = this.maxHistoryStates;
            settingsModal.classList.remove('hidden');
        });

        document.getElementById('closeSettingsBtn').addEventListener('click', () => {
            settingsModal.classList.add('hidden');
        });

        document.getElementById('saveSettingsBtn').addEventListener('click', () => {
            let newLimit = parseInt(historyInput.value);
            if (isNaN(newLimit) || newLimit < 5) newLimit = 5;
            if (newLimit > 100) newLimit = 100;
            
            this.maxHistoryStates = newLimit;
            localStorage.setItem('bgRemover_maxHistory', newLimit);
            
            // Trim current history if needed
            if (this.history.length > this.maxHistoryStates) {
                const diff = this.history.length - this.maxHistoryStates;
                this.history.splice(0, diff);
                this.historyIndex -= diff;
                if (this.historyIndex < 0) this.historyIndex = 0;
            }
            
            settingsModal.classList.add('hidden');
            this.updateUI();
        });

        settingsModal.addEventListener('click', (e) => {
            if (e.target === settingsModal) settingsModal.classList.add('hidden');
        });

        document.getElementById('resetCanvasBtn').addEventListener('click', () => {
            if (this.img) {
                if (confirm('Are you sure you want to reset the canvas? All unsaved changes will be lost.')) {
                    this.resetCanvas();
                }
            } else {
                this.resetCanvas();
            }
        });

        document.getElementById('openImageBtn').addEventListener('click', () => {
            if (this.img) {
                if (confirm('Opening a new image will discard your current changes. Continue?')) {
                    document.getElementById('imageInput').click();
                }
            } else {
                document.getElementById('imageInput').click();
            }
        });
        
        // Empty State Interactions
        const emptyState = document.getElementById('emptyState');
        emptyState.addEventListener('click', () => document.getElementById('imageInput').click());
        
        // Drag and Drop
        const dropZone = document.body; // Allow dropping anywhere
        
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            if (!this.img) emptyState.classList.add('bg-slate-800/80');
        });
        
        dropZone.addEventListener('dragleave', (e) => {
            e.preventDefault();
            if (!this.img) emptyState.classList.remove('bg-slate-800/80');
        });
        
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            if (!this.img) emptyState.classList.remove('bg-slate-800/80');
            
            if (this.img) return;

            if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                this.handleFile(e.dataTransfer.files[0]);
            }
        });

        document.getElementById('tool-manual').addEventListener('click', () => this.toggleTools('manual'));
        document.getElementById('tool-magic').addEventListener('click', () => this.toggleTools('magic'));

        // Setting Triggers (Popup Logic)
        document.querySelectorAll('.setting-trigger').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const targetId = btn.getAttribute('data-target');
                const popup = document.getElementById('slider-popup');
                const allGroups = document.querySelectorAll('.slider-group');
                const targetGroup = document.getElementById(targetId);
                
                // Toggle if clicking the same button
                if (btn.classList.contains('active-setting')) {
                    popup.classList.remove('opacity-100', 'translate-y-0', 'scale-100', 'pointer-events-auto');
                    popup.classList.add('opacity-0', 'translate-y-4', 'scale-95', 'pointer-events-none');
                    
                    btn.classList.remove('active-setting');
                    btn.classList.remove('text-theme');
                    btn.classList.add('text-slate-400');
                    return;
                }

                // Reset all buttons
                document.querySelectorAll('.setting-trigger').forEach(b => {
                    b.classList.remove('active-setting');
                    b.classList.remove('text-theme');
                    b.classList.add('text-slate-400');
                });

                // Activate current
                btn.classList.add('active-setting');
                btn.classList.remove('text-slate-400');
                btn.classList.add('text-theme');

                // Show popup and correct group
                allGroups.forEach(g => g.classList.add('hidden'));
                targetGroup.classList.remove('hidden');
                
                popup.classList.remove('opacity-0', 'translate-y-4', 'scale-95', 'pointer-events-none');
                popup.classList.add('opacity-100', 'translate-y-0', 'scale-100', 'pointer-events-auto');
            });
        });

        // Close popup when clicking outside
        window.addEventListener('click', (e) => {
            const popup = document.getElementById('slider-popup');
            const island = document.getElementById('control-island');
            if (!popup.contains(e.target) && !island.contains(e.target)) {
                popup.classList.remove('opacity-100', 'translate-y-0', 'scale-100', 'pointer-events-auto');
                popup.classList.add('opacity-0', 'translate-y-4', 'scale-95', 'pointer-events-none');
                
                document.querySelectorAll('.setting-trigger').forEach(b => {
                    b.classList.remove('active-setting');
                    b.classList.remove('text-theme');
                    b.classList.add('text-slate-400');
                });
            }
        });

        const brushSizeInput = document.getElementById('brush-size');
        brushSizeInput.addEventListener('input', (e) => {
            this.settings.brushSize = parseInt(e.target.value);
            document.getElementById('val-size').innerText = e.target.value + 'px';
            this.showBrushPreview(this.settings.brushSize);
        });
        brushSizeInput.addEventListener('mouseup', () => this.hideBrushPreview(1000));
        brushSizeInput.addEventListener('touchend', () => this.hideBrushPreview(1000));

        this.bindSlider('brush-feather', 'val-feather', (v) => { this.settings.brushFeather = parseInt(v) / 100; }, '%');
        this.bindSlider('brush-opacity', 'val-opacity', (v) => { this.settings.brushOpacity = parseInt(v) / 100; }, '%');

        this.bindSlider('magic-tolerance', 'val-tolerance', (v) => { 
            this.settings.magicTolerance = parseInt(v); 
            this.triggerMagicUpdate();
        }, '');
        this.bindSlider('magic-opacity', 'val-magic-opacity', (v) => { 
            this.settings.magicOpacity = parseInt(v) / 100; 
            this.triggerMagicUpdate();
        }, '%');
        this.bindSlider('magic-smoothness', 'val-smoothness', (v) => {
            this.settings.magicSmoothness = parseInt(v);
            this.triggerMagicUpdate();
        }, '');

        this.viewport.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        window.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        window.addEventListener('mouseup', (e) => this.handleMouseUp(e));
        
        window.addEventListener('keyup', (e) => {
            if (e.code === 'Space') {
                this.isSpacePressed = false;
                this.canvas.classList.remove('panning');
            }
        });
        
        this.viewport.parentElement.addEventListener('wheel', (e) => this.handleWheel(e));
        document.getElementById('zoomIn').addEventListener('click', () => this.zoom(0.1));
        document.getElementById('zoomOut').addEventListener('click', () => this.zoom(-0.1));
        document.getElementById('fitScreen').addEventListener('click', () => this.fitToScreen());

        document.getElementById('undoBtn').addEventListener('click', () => this.undo());
        document.getElementById('redoBtn').addEventListener('click', () => this.redo());
        document.getElementById('resetBtn').addEventListener('click', () => this.reset());

        const compareBtn = document.getElementById('compareBtn');
        compareBtn.addEventListener('mousedown', () => this.startCompare());
        compareBtn.addEventListener('mouseup', () => this.endCompare());
        compareBtn.addEventListener('mouseleave', () => this.endCompare());

        // Keyboard Shortcuts
        window.addEventListener('keydown', (e) => this.handleKeyDown(e));
    },

    handleKeyDown(e) {
        // Ignore if typing in an input
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        // Spacebar Pan (Prevent Scroll)
        if (e.code === 'Space') {
            e.preventDefault();
            this.isSpacePressed = true;
            this.canvas.classList.add('panning');
        }

        // Undo / Redo
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
            e.preventDefault();
            if (e.shiftKey) {
                this.redo();
            } else {
                this.undo();
            }
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
            e.preventDefault();
            this.redo();
        }

        // Tools
        if (e.key.toLowerCase() === 'b') {
            this.toggleTools('manual');
        }
        if (e.key.toLowerCase() === 'w') {
            this.toggleTools('magic');
        }

        // Settings Shortcuts
        if (e.key.toLowerCase() === 'f') {
            if (this.currentTool === 'magic') {
                this.triggerSettingPopup('setting-magic-tolerance');
            }
        }
        if (e.key.toLowerCase() === 's') {
            if (this.currentTool === 'magic') {
                this.triggerSettingPopup('setting-magic-smoothness');
            }
        }
        if (e.key.toLowerCase() === 'o') {
            if (this.currentTool === 'magic') {
                this.triggerSettingPopup('setting-magic-opacity');
            } else {
                this.triggerSettingPopup('setting-brush-opacity');
            }
        }
    },

    triggerSettingPopup(targetId) {
        // Find the button that targets this setting
        const btn = document.querySelector(`.setting-trigger[data-target="${targetId}"]`);
        if (btn) {
            // If it's hidden (because tool is not active), don't trigger
            if (btn.offsetParent === null) return;
            
            // Simulate click logic
            // We can't just btn.click() because we want to ensure it opens, not toggles closed if already open?
            // Actually, toggle is fine, but let's be consistent with the click handler.
            // The click handler toggles.
            btn.click();
        }
    },

    bindSlider(id, displayId, callback, suffix) {
        const el = document.getElementById(id);
        el.addEventListener('input', (e) => {
            document.getElementById(displayId).innerText = e.target.value + suffix;
            callback(e.target.value);
        });
    },

    initTooltips() {
        const tooltip = document.getElementById('global-tooltip');
        let hideTimeout;

        const show = (target) => {
            const text = target.getAttribute('data-tooltip');
            if (!text) return;

            if (hideTimeout) clearTimeout(hideTimeout);

            tooltip.textContent = text;
            tooltip.style.display = 'block';

            const rect = target.getBoundingClientRect();
            const tooltipRect = tooltip.getBoundingClientRect();

            let left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);
            let top = rect.top - tooltipRect.height - 8;

            if (left < 8) left = 8;
            if (left + tooltipRect.width > window.innerWidth - 8) {
                left = window.innerWidth - tooltipRect.width - 8;
            }
            if (top < 8) {
                top = rect.bottom + 8;
            }

            tooltip.style.left = `${left}px`;
            tooltip.style.top = `${top}px`;
            
            requestAnimationFrame(() => {
                tooltip.classList.add('visible');
            });
        };

        const hide = () => {
            tooltip.classList.remove('visible');
            hideTimeout = setTimeout(() => {
                tooltip.style.display = 'none';
            }, 200);
        };

        document.addEventListener('mouseover', (e) => {
            const target = e.target.closest('[data-tooltip]');
            if (target) show(target);
        });

        document.addEventListener('mouseout', (e) => {
            const target = e.target.closest('[data-tooltip]');
            if (target) hide();
        });
        
        window.addEventListener('scroll', hide, true);
    },

    showBrushPreview(size) {
        const overlay = document.getElementById('brush-preview-overlay');
        const cursor = document.getElementById('brush-cursor-preview');
        
        if (this.brushPreviewTimeout) clearTimeout(this.brushPreviewTimeout);
        
        overlay.classList.remove('hidden');
        void overlay.offsetWidth; 
        overlay.style.opacity = '1';
        
        const displaySize = size * this.scale;
        
        cursor.style.width = `${displaySize}px`;
        cursor.style.height = `${displaySize}px`;
    },

    hideBrushPreview(delay = 0) {
        if (this.brushPreviewTimeout) clearTimeout(this.brushPreviewTimeout);
        
        this.brushPreviewTimeout = setTimeout(() => {
            const overlay = document.getElementById('brush-preview-overlay');
            overlay.style.opacity = '0';
            setTimeout(() => {
                overlay.classList.add('hidden');
            }, 300);
        }, delay);
    },

    toggleTools(tool) {
        this.currentTool = tool;
        if (tool !== 'magic') {
            this.activeMagicWand = null;
        }
        
        document.querySelectorAll('.tool-btn').forEach(b => {
            b.classList.remove('bg-slate-700', 'text-white');
            b.classList.add('text-slate-400');
        });
        const activeBtn = document.getElementById(`tool-${tool}`);
        activeBtn.classList.remove('text-slate-400');
        activeBtn.classList.add('bg-slate-700', 'text-white');

        document.getElementById('options-manual').classList.add('hidden');
        document.getElementById('options-magic').classList.add('hidden');
        document.getElementById(`options-${tool}`).classList.remove('hidden');
        
        // Hide popup when switching tools
        const popup = document.getElementById('slider-popup');
        popup.classList.remove('opacity-100', 'translate-y-0', 'scale-100', 'pointer-events-auto');
        popup.classList.add('opacity-0', 'translate-y-4', 'scale-95', 'pointer-events-none');
        
        document.querySelectorAll('.setting-trigger').forEach(b => {
            b.classList.remove('active-setting', 'text-theme');
            b.classList.add('text-slate-400');
        });
    },

    handleImageUpload(e) {
        const file = e.target.files[0];
        if (!file) return;
        this.handleFile(file);
    },

    handleFile(file) {
        const errorMsg = document.getElementById('errorMsg');
        errorMsg.classList.add('hidden');

        if (!file.type.startsWith('image/')) {
            errorMsg.textContent = "Error: Please upload a valid image file (PNG, JPG, etc.)";
            errorMsg.classList.remove('hidden');
            return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
            this.img = new Image();
            this.img.onload = () => {
                this.setupCanvas();
            };
            this.img.onerror = () => {
                errorMsg.textContent = "Error: Could not load image data.";
                errorMsg.classList.remove('hidden');
            };
            this.img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    },

    setupCanvas() {
        this.canvas.width = this.img.width;
        this.canvas.height = this.img.height;
        
        this.ctx.drawImage(this.img, 0, 0);
        
        this.originalImageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);

        this.history = [];
        this.historyIndex = -1;
        this.saveState();

        this.viewport.classList.remove('hidden');
        this.canvas.classList.remove('hidden');
        document.getElementById('emptyState').classList.add('hidden');
        document.getElementById('downloadBtn').disabled = false;
        this.fitToScreen();
    },

    fitToScreen() {
        if (!this.img) return;
        const container = this.viewport.parentElement;
        const padding = 40;
        
        const availableW = container.clientWidth - padding;
        const availableH = container.clientHeight - padding;
        
        const scaleW = availableW / this.img.width;
        const scaleH = availableH / this.img.height;
        
        this.scale = Math.min(scaleW, scaleH, 1);
        this.offset = { x: 0, y: 0 };
        
        this.updateTransform();
    },

    updateTransform() {
        this.viewport.style.width = `${this.canvas.width}px`;
        this.viewport.style.height = `${this.canvas.height}px`;
        this.viewport.style.transform = `scale(${this.scale}) translate(${this.offset.x}px, ${this.offset.y}px)`;
        document.getElementById('zoomLevel').innerText = Math.round(this.scale * 100) + '%';
    },

    handleWheel(e) {
        if (!this.img) return;
        e.preventDefault();
        
        const zoomIntensity = 0.1;
        const delta = e.deltaY < 0 ? 1 : -1;
        const newScale = Math.max(0.1, Math.min(5, this.scale + (delta * zoomIntensity)));
        
        this.scale = newScale;
        this.updateTransform();
    },

    zoom(delta) {
        if (!this.img) return;
        this.scale = Math.max(0.1, Math.min(5, this.scale + delta));
        this.updateTransform();
    },

    getCanvasCoordinates(e) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: (e.clientX - rect.left) / this.scale,
            y: (e.clientY - rect.top) / this.scale
        };
    },

    handleMouseDown(e) {
        if (!this.img) return;

        if (e.button === 1 || (e.button === 0 && this.isSpacePressed)) { 
            this.panning = true;
            this.panStart = { x: e.clientX, y: e.clientY };
            this.viewport.parentElement.classList.add('panning');
            return;
        }

        if (e.button !== 0) return;

        const pos = this.getCanvasCoordinates(e);

        if (this.currentTool === 'manual') {
            this.activeMagicWand = null;
            this.isDrawing = true;
            this.drawBrush(pos.x, pos.y);
        } else if (this.currentTool === 'magic') {
            this.performMagicWand(Math.floor(pos.x), Math.floor(pos.y));
        }
    },

    handleMouseMove(e) {
        if (this.panning) {
            const dx = (e.clientX - this.panStart.x) / this.scale;
            const dy = (e.clientY - this.panStart.y) / this.scale;
            this.offset.x += dx;
            this.offset.y += dy;
            this.panStart = { x: e.clientX, y: e.clientY };
            this.updateTransform();
            return;
        }

        if (!this.isDrawing) return;

        const pos = this.getCanvasCoordinates(e);
        this.drawBrush(pos.x, pos.y);
    },

    handleMouseUp(e) {
        if (this.panning) {
            this.panning = false;
            this.viewport.parentElement.classList.remove('panning');
            return;
        }

        if (this.isDrawing) {
            this.isDrawing = false;
            this.saveState();
        }
    },

    drawBrush(x, y) {
        const { brushSize, brushFeather, brushOpacity } = this.settings;
        
        this.ctx.save();
        this.ctx.globalCompositeOperation = 'destination-out';
        
        const radius = brushSize / 2;
        const grad = this.ctx.createRadialGradient(x, y, radius * (1 - brushFeather), x, y, radius);
        
        grad.addColorStop(0, `rgba(0, 0, 0, ${brushOpacity})`); 
        if (brushFeather > 0) {
           grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        } else {
           grad.addColorStop(1, `rgba(0, 0, 0, ${brushOpacity})`);
        }

        this.ctx.fillStyle = grad;
        this.ctx.beginPath();
        this.ctx.arc(x, y, radius, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.restore();
    },

    triggerMagicUpdate() {
        if (!this.activeMagicWand) return;

        if (this.debounceTimer) clearTimeout(this.debounceTimer);
        
        this.debounceTimer = setTimeout(() => {
            this.updateMagicWand();
        }, 50);
    },

    async updateMagicWand() {
        if (!this.activeMagicWand) return;
        
        const { x, y, baseImageData } = this.activeMagicWand;
        
        await this.applyMagicWandAlgo(x, y, baseImageData);
        
        this.replaceState();
    },

    async performMagicWand(startX, startY) {
        document.getElementById('loader').classList.remove('hidden');

        await new Promise(r => setTimeout(r, 10));

        const width = this.canvas.width;
        const height = this.canvas.height;
        
        const baseImageData = this.ctx.getImageData(0, 0, width, height);

        this.activeMagicWand = {
            x: startX,
            y: startY,
            baseImageData: baseImageData
        };

        await this.applyMagicWandAlgo(startX, startY, baseImageData);

        this.saveState();
        
        document.getElementById('loader').classList.add('hidden');

        // Auto-open tolerance slider if not already open
        const toleranceBtn = document.querySelector('.setting-trigger[data-target="setting-magic-tolerance"]');
        if (toleranceBtn && !toleranceBtn.classList.contains('active-setting')) {
            setTimeout(() => toleranceBtn.click(), 50);
        }
    },

    async applyMagicWandAlgo(startX, startY, baseImageData) {
        const width = this.canvas.width;
        const height = this.canvas.height;
        
        const newImageData = new ImageData(
            new Uint8ClampedArray(baseImageData.data),
            width,
            height
        );
        const data = newImageData.data;

        const getIndex = (x, y) => (y * width + x) * 4;

        const startIndex = getIndex(startX, startY);
        const targetR = data[startIndex];
        const targetG = data[startIndex + 1];
        const targetB = data[startIndex + 2];
        const targetA = data[startIndex + 3];

        if (targetA === 0) return;

        const mask = new Uint8Array(width * height);
        const queue = [startIndex];
        mask[startIndex / 4] = 1; 

        const tolerance = this.settings.magicTolerance;
        const maxDist = Math.sqrt(255*255 * 3);
        const allowedDist = (tolerance / 100) * maxDist;
        
        let qIndex = 0;
        while (qIndex < queue.length) {
            const idx = queue[qIndex++];
            
            const pxIndex = idx / 4;
            const x = pxIndex % width;
            const y = Math.floor(pxIndex / width);

            const neighbors = [
                { nx: x + 1, ny: y },
                { nx: x - 1, ny: y },
                { nx: x, ny: y + 1 },
                { nx: x, ny: y - 1 }
            ];

            for (let n of neighbors) {
                if (n.nx >= 0 && n.nx < width && n.ny >= 0 && n.ny < height) {
                    const nIdx = getIndex(n.nx, n.ny);
                    const nMaskIdx = nIdx / 4;
                    
                    if (mask[nMaskIdx] === 0) {
                        const nr = data[nIdx];
                        const ng = data[nIdx+1];
                        const nb = data[nIdx+2];
                        const nDist = Math.sqrt(Math.pow(nr - targetR, 2) + Math.pow(ng - targetG, 2) + Math.pow(nb - targetB, 2));
                        
                        if (nDist <= allowedDist) {
                            mask[nMaskIdx] = 1;
                            queue.push(nIdx);
                        }
                    }
                }
            }
        }

        const smoothness = this.settings.magicSmoothness;
        let finalMask = mask;

        if (smoothness > 0) {
            const blurredMask = new Float32Array(width * height);
            const r = Math.floor(smoothness / 2) + 1;
            
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    let sum = 0;
                    let count = 0;
                    for (let k = -r; k <= r; k++) {
                        const nx = x + k;
                        if (nx >= 0 && nx < width) {
                            sum += mask[y * width + nx];
                            count++;
                        }
                    }
                    blurredMask[y * width + x] = sum / count;
                }
            }
            
            for (let x = 0; x < width; x++) {
                for (let y = 0; y < height; y++) {
                    let sum = 0;
                    let count = 0;
                    for (let k = -r; k <= r; k++) {
                        const ny = y + k;
                        if (ny >= 0 && ny < height) {
                            sum += blurredMask[ny * width + x];
                            count++;
                        }
                    }
                    const val = sum / count;
                    finalMask[y * width + x] = val > 0.5 ? 1 : 0;
                }
            }
        }

        const removalAlphaFactor = 1 - this.settings.magicOpacity;

        for (let i = 0; i < width * height; i++) {
            if (finalMask[i] === 1) {
                const idx = i * 4;
                data[idx + 3] = data[idx + 3] * removalAlphaFactor;
            }
        }

        this.ctx.putImageData(newImageData, 0, 0);
    },

    saveState() {
        if (this.historyIndex < this.history.length - 1) {
            this.history = this.history.slice(0, this.historyIndex + 1);
        }
        
        if (this.history.length > this.maxHistoryStates) {
            this.history.shift();
            this.historyIndex--;
        }

        const data = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
        this.history.push(data);
        this.historyIndex++;
        this.updateUI();
    },

    replaceState() {
        if (this.historyIndex >= 0) {
            const data = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
            this.history[this.historyIndex] = data;
        }
    },

    undo() {
        if (this.historyIndex > 0) {
            this.historyIndex--;
            this.ctx.putImageData(this.history[this.historyIndex], 0, 0);
            this.updateUI();
        }
    },

    redo() {
        if (this.historyIndex < this.history.length - 1) {
            this.historyIndex++;
            this.ctx.putImageData(this.history[this.historyIndex], 0, 0);
            this.updateUI();
        }
    },

    reset() {
        if (!this.img) return;
        this.ctx.putImageData(this.originalImageData, 0, 0);
        this.saveState();
    },
resetCanvas() {
        this.img = null;
        this.originalImageData = null;
        this.history = [];
        this.historyIndex = -1;
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        document.getElementById('emptyState').classList.remove('hidden');
        this.viewport.classList.add('hidden');
        this.canvas.classList.add('hidden');
        document.getElementById('downloadBtn').disabled = true;
        document.getElementById('imageInput').value = '';
        document.getElementById('errorMsg').classList.add('hidden');
        
        this.scale = 1;
        this.offset = { x: 0, y: 0 };
        this.updateTransform();
    },

    startCompare() {
        if (!this.img) return;
        const current = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.putImageData(this.originalImageData, 0, 0);
        this.tempCompareData = current;
    },

    endCompare() {
        if (!this.img || !this.tempCompareData) return;
        this.ctx.putImageData(this.tempCompareData, 0, 0);
        this.tempCompareData = null;
    },

    updateUI() {
        document.getElementById('undoBtn').disabled = this.historyIndex <= 0;
        document.getElementById('redoBtn').disabled = this.historyIndex >= this.history.length - 1;
    },

    downloadImage() {
        if (!this.img) return;
        const link = document.createElement('a');
        link.download = 'background-removed.png';
        link.href = this.canvas.toDataURL('image/png');
        link.click();
    }
};

window.addEventListener('DOMContentLoaded', () => {
    window.addEventListener('keydown', (e) => {
        if(e.code === 'Space' && e.target == document.body) e.preventDefault();
    });
    App.init();
});