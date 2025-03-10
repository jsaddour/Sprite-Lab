// engine.js
class GameEngine {
    constructor(canvasId, spriteData = {}, options = {}) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.player = {
            x: 50,
            y: -50,
            speed: 5,
            velocityY: 0,
            jumping: false,
            sprite: null,
            originalSprite: null,
            currentAnimation: 'idle',
            currentFrame: 0,
            frameTimer: 0,
            facingRight: true,
            defaultFacingRight: true,
            transparentColor: '#FFFFFF',
            zoom: 1.0,
            controls: { left: 'arrowleft', right: 'arrowright', jump: 'arrowup' },
            animations: {
                idle: { frames: 1, width: 32, height: 32, speed: 0.1, startX: 0, startY: 0, paddingX: 0, paddingY: 0 },
                walk: { frames: 1, width: 32, height: 32, speed: 0.1, startX: 0, startY: 0, paddingX: 0, paddingY: 0 },
                jump: { frames: 1, width: 32, height: 32, speed: 0.1, startX: 0, startY: 0, paddingX: 0, paddingY: 0 }
            },
            behaviors: {
                idle: { distanceX: 0, distanceY: 0 },
                walk: { distanceX: 5, distanceY: 0 },
                jump: { distanceX: 0, distanceY: -10 }
            }
        };
        this.keys = { left: false, right: false, jump: false, jumpPressed: false };
        this.gravity = 0.5;
        this.transparencyTolerance = 1;
        this.debug = false;

        this.platforms = [];
        this.currentPlatform = null;
        this.initialPlayerX = this.player.x;
        this.scrollSpeed = 1;
        this.virtualPlayerX = this.player.x;
        this.minPlatformGap = 300;

        this.preview = options.preview || false;

        this.loadSpriteData(spriteData);
        this.setupEventListeners();
        this.startGameLoop();
    }

    loadSpriteData(spriteData) {
        console.log('Loading sprite data:', spriteData);

        if (spriteData.parameters) {
            const params = spriteData.parameters;
            this.player.defaultFacingRight = params.defaultOrientation === 'right';
            this.player.facingRight = this.player.defaultFacingRight;
            this.player.transparentColor = params.transparentColor || '#ffffff';
            this.gravity = params.gravity || 0.5;
            this.player.zoom = params.zoom || 1.0;
            this.player.controls = params.controls || this.player.controls;
            this.player.animations = params.animations || this.player.animations;
            this.player.behaviors = params.behaviors || this.player.behaviors;

            console.log('Transparent color set to:', this.player.transparentColor);

            Object.keys(this.player.controls).forEach(key => {
                this.keys[key] = false;
                if (key.startsWith('custom')) {
                    this.keys[`${key}Pressed`] = false;
                    this.keys[`${key}Triggered`] = false;
                }
            });
        }

        if (spriteData.sprite) {
            const img = new Image();
            img.onload = () => {
                this.player.originalSprite = img;
                this.applyTransparency(img);
            };
            img.onerror = () => console.error('Failed to load sprite:', spriteData.sprite);
            img.src = spriteData.sprite;
        }
    }

    applyTransparency(img) {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = img.width;
        tempCanvas.height = img.height;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.drawImage(img, 0, 0);

        const imageData = tempCtx.getImageData(0, 0, img.width, img.height);
        const data = imageData.data;
        const transparentRGB = this.hexToRgb(this.player.transparentColor);

        if (!transparentRGB) {
            console.error(`Invalid transparent color: ${this.player.transparentColor}`);
            return;
        }

        console.log(`Applying transparency with color: ${this.player.transparentColor}, RGB:`, transparentRGB);

        let semiTransparentDetected = false;
        let transparentPixels = 0;
        let opaquePixels = 0;
        for (let i = 0; i < data.length; i += 4) {
            const alpha = data[i + 3];
            if (alpha > 0 && alpha < 255) {
                semiTransparentDetected = true;
            }
            if (alpha === 0) {
                transparentPixels++;
            } else if (alpha === 255) {
                opaquePixels++;
            }
        }
        if (semiTransparentDetected) {
            console.warn('Semi-transparent pixels detected in the source image!');
        }
        console.log(`Before processing - Transparent pixels: ${transparentPixels}, Opaque pixels: ${opaquePixels}`);

        for (let i = 0; i < data.length; i += 4) {
            if (data[i + 3] > 0) {
                data[i + 3] = 255;
            }
        }

        for (let i = 0; i < data.length; i += 4) {
            const rDiff = Math.abs(data[i] - transparentRGB.r);
            const gDiff = Math.abs(data[i + 1] - transparentRGB.g);
            const bDiff = Math.abs(data[i + 2] - transparentRGB.b);
            if (rDiff <= this.transparencyTolerance && gDiff <= this.transparencyTolerance && bDiff <= this.transparencyTolerance) {
                data[i + 3] = 0;
            }
        }

        transparentPixels = 0;
        opaquePixels = 0;
        for (let i = 0; i < data.length; i += 4) {
            if (data[i + 3] === 0) {
                transparentPixels++;
            } else if (data[i + 3] === 255) {
                opaquePixels++;
            }
        }
        console.log(`After processing - Transparent pixels: ${transparentPixels}, Opaque pixels: ${opaquePixels}`);

        tempCtx.putImageData(imageData, 0, 0);
        this.player.sprite = new Image();
        this.player.sprite.onload = () => {
            this.player.width = this.player.animations.idle.width;
            this.player.height = this.player.animations.idle.height;
        };
        this.player.sprite.src = tempCanvas.toDataURL();
    }

    hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : null;
    }

    setupEventListeners() {
        document.addEventListener('keydown', (e) => {
            const key = e.key.toLowerCase();
            if (key === this.player.controls.left) this.keys.left = true;
            if (key === this.player.controls.right) this.keys.right = true;
            if (key === this.player.controls.jump && !this.keys.jumpPressed) {
                this.keys.jump = true;
                this.keys.jumpPressed = true;
            }
            Object.keys(this.player.controls).filter(id => id.startsWith('custom')).forEach(animId => {
                if (key === this.player.controls[animId] && !this.keys[`${animId}Pressed`]) {
                    this.keys[animId] = true;
                    this.keys[`${animId}Pressed`] = true;
                }
            });
        });

        document.addEventListener('keyup', (e) => {
            const key = e.key.toLowerCase();
            if (key === this.player.controls.left) this.keys.left = false;
            if (key === this.player.controls.right) this.keys.right = false;
            if (key === this.player.controls.jump) {
                this.keys.jump = false;
                this.keys.jumpPressed = false;
            }
            Object.keys(this.player.controls).filter(id => id.startsWith('custom')).forEach(animId => {
                if (key === this.player.controls[animId]) {
                    this.keys[animId] = false;
                    this.keys[`${animId}Pressed`] = false;
                    this.keys[`${animId}Triggered`] = false;
                }
            });
        });
    }

    updateAnimation(delta) {
        const anim = this.player.animations[this.player.currentAnimation] || this.player.animations.idle;

        if (this.player.jumping) {
            this.player.currentAnimation = 'jump';
        } else if (this.keys.left || this.keys.right) {
            this.player.currentAnimation = 'walk';
        } else {
            let customTriggered = false;
            for (const animId of Object.keys(this.player.controls).filter(id => id.startsWith('custom'))) {
                if (this.keys[animId]) {
                    if (this.player.behaviors[animId]?.repeat) {
                        this.player.currentAnimation = animId;
                        customTriggered = true;
                    } else if (!this.keys[`${animId}Triggered`]) {
                        this.player.currentAnimation = animId;
                        this.keys[`${animId}Triggered`] = true;
                        customTriggered = true;
                    }
                    break;
                }
            }
            if (!customTriggered) {
                this.player.currentAnimation = 'idle';
            }
        }

        this.player.frameTimer += this.player.speed / 60;
        if (this.player.frameTimer >= anim.speed) {
            this.player.currentFrame = (this.player.currentFrame + 1) % anim.frames;
            if (this.player.currentFrame >= anim.frames) {
                this.player.currentFrame = anim.frames - 1;
            }
            this.player.frameTimer = 0;
        }

        this.player.width = anim.width;
        this.player.height = anim.height;
    }

    addPlatform(platformElement) {
        const platform = {
            element: platformElement,
            getRect: () => {
                const rect = platformElement.getBoundingClientRect();
                return {
                    x: rect.left,
                    y: rect.top + (platform.offsetY || 0),
                    width: rect.width,
                    height: rect.height
                };
            },
            initialY: parseFloat(platformElement.style.top) || 0,
            offsetY: 0,
            velocityY: 0,
            springConstant: 0.1,
            damping: 0.85,
            lastX: null
        };
        this.platforms.push(platform);
    }

    updatePhysics() {
        const currentBehavior = this.player.behaviors[this.player.currentAnimation] || this.player.behaviors.idle;

        // Mouvement horizontal du joueur
        let totalDistanceX = 0;
        const walkDistanceX = this.player.behaviors.walk.distanceX || 5;
        const maxPlayerX = this.preview ? this.canvas.width - (this.player.width * this.player.zoom) : this.canvas.width * 0.6;

        if (this.keys.left && this.player.x > 0) {
            totalDistanceX -= walkDistanceX;
            this.player.facingRight = false;
        }
        if (this.keys.right) {
            totalDistanceX += walkDistanceX;
            this.player.facingRight = true;
        }
        if (this.player.currentAnimation === 'idle' || this.player.currentAnimation === 'jump' || this.player.currentAnimation.startsWith('custom')) {
            totalDistanceX += currentBehavior.distanceX;
        }

        this.virtualPlayerX += totalDistanceX;
        this.player.x = Math.min(Math.max(0, this.player.x + totalDistanceX), maxPlayerX);

        // Gestion du saut
        if (this.keys.jump && !this.player.jumping) {
            console.log('Jump triggered');
            this.player.velocityY = -10;
            this.player.jumping = true;
            this.keys.jump = false;
            this.currentPlatform = null;
        }

        // Appliquer la gravité au joueur
        this.player.velocityY += this.gravity;
        this.player.y += this.player.velocityY;

        // Limite haute (plafond)
        if (this.player.y < 0) {
            console.log('Hit ceiling');
            this.player.y = 0;
            this.player.velocityY = 0;
        }

        // Rectangle du joueur
        const playerRect = {
            x: this.player.x,
            y: this.player.y,
            width: this.player.width * this.player.zoom,
            height: this.player.height * this.player.zoom
        };

        // Mettre à jour les plateformes et vérifier les collisions
        let onPlatform = false;
        for (const platform of this.platforms) {
            const platRect = platform.getRect();

            if (platform.lastX !== null) {
                const deltaX = platRect.x - platform.lastX;
                if (this.currentPlatform === platform && !this.player.jumping) {
                    this.player.x += deltaX;
                }
            }
            platform.lastX = platRect.x;

            if (this.isColliding(playerRect, platRect)) {
                if (this.player.velocityY > 0 && playerRect.y + playerRect.height - this.player.velocityY <= platRect.y + 5) {
                    console.log('Landed on platform');
                    this.player.y = platRect.y - playerRect.height;
                    this.player.velocityY = 0;
                    this.player.jumping = false;
                    onPlatform = true;
                    this.currentPlatform = platform;

                    platform.velocityY = 2;
                } else if (this.player.velocityY < 0 && playerRect.y >= platRect.y + platRect.height) {
                    console.log('Hit platform from below');
                    this.player.y = platRect.y + platRect.height;
                    this.player.velocityY = 0;
                }
            }

            const displacement = platform.offsetY;
            const springForce = -platform.springConstant * displacement;
            platform.velocityY += springForce;
            platform.velocityY *= platform.damping;
            platform.offsetY += platform.velocityY;
            platform.element.style.top = `${platform.initialY + platform.offsetY}px`;
        }

        if (this.currentPlatform && !this.player.jumping) {
            const platRect = this.currentPlatform.getRect();
            if (this.isColliding(playerRect, platRect)) {
                this.player.y = platRect.y - playerRect.height;
            } else {
                this.currentPlatform = null;
            }
        }

        // Collision avec le sol : réinitialisation conditionnelle
        if (!onPlatform && this.player.y > this.canvas.height - (this.player.height * this.player.zoom)) {
            if (!this.preview) {
                console.log('Player hit the ground - resetting');
                this.player.y = -50; // Réinitialisation en haut
                this.player.x = 50; // Réinitialisation à la position initiale en X relative au canvas
                this.player.velocityY = 0;
                this.player.jumping = false;
                this.currentPlatform = null;
                // Note : On ne touche pas à this.virtualPlayerX pour préserver le scrolling
            } else {
                console.log('Player hit the ground - preview mode, no reset');
                this.player.y = this.canvas.height - (this.player.height * this.player.zoom);
                this.player.velocityY = 0;
                this.player.jumping = false;
                this.currentPlatform = null;
            }
        }

        this.updatePlatformsScroll();
    }

    updatePlatformsScroll() {
        const playerDeltaX = this.virtualPlayerX - this.initialPlayerX;
        const scrollOffset = playerDeltaX * this.scrollSpeed;

        this.platforms.forEach(platform => {
            const initialLeft = parseFloat(platform.element.dataset.initialLeft) || parseFloat(platform.element.style.left);
            if (!platform.element.dataset.initialLeft) {
                platform.element.dataset.initialLeft = initialLeft;
            }

            let newLeft = initialLeft - scrollOffset;
            const platformWidth = platform.element.offsetWidth;

            // Réinitialiser la plateforme si elle sort à gauche
            if (newLeft + platformWidth < 0) {
                // Positionner la plateforme à droite de l’écran visible
                newLeft = this.canvas.width + scrollOffset + this.minPlatformGap;
                platform.element.dataset.initialLeft = newLeft;

                // Nouvelle position verticale aléatoire
                const newTop = Math.random() * (this.canvas.height - 150);
                platform.element.style.top = `${newTop}px`;
                platform.initialY = newTop;
                platform.offsetY = 0;
                platform.velocityY = 0;
            }

            platform.element.style.left = `${newLeft}px`;
        });
    }

    isColliding(rect1, rect2) {
        return rect1.x < rect2.x + rect2.width &&
               rect1.x + rect1.width > rect2.x &&
               rect1.y < rect2.y + rect2.height &&
               rect1.y + rect1.height > rect2.y;
    }

    render() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        if (this.player.sprite) {
            const anim = this.player.animations[this.player.currentAnimation] || this.player.animations.idle;
            const limitedFrame = Math.min(this.player.currentFrame, anim.frames - 1);
            const frameX = anim.startX + limitedFrame * (anim.width + anim.paddingX);
            const frameY = anim.startY;

            this.ctx.save();
            const shouldMirror = this.player.facingRight !== this.player.defaultFacingRight;
            if (shouldMirror) {
                this.ctx.scale(-1, 1);
                this.ctx.translate(-this.canvas.width, 0);
                this.ctx.drawImage(
                    this.player.sprite,
                    frameX, frameY,
                    anim.width, anim.height,
                    this.canvas.width - this.player.x - (anim.width * this.player.zoom), this.player.y,
                    anim.width * this.player.zoom, anim.height * this.player.zoom
                );
            } else {
                this.ctx.drawImage(
                    this.player.sprite,
                    frameX, frameY,
                    anim.width, anim.height,
                    this.player.x, this.player.y,
                    anim.width * this.player.zoom, anim.height * this.player.zoom
                );
            }
            this.ctx.restore();
        } else {
            this.ctx.fillStyle = 'red';
            this.ctx.fillRect(this.player.x, this.player.y, this.player.width * this.player.zoom, this.player.height * this.player.zoom);
        }

        if (this.debug) {
            this.ctx.strokeStyle = 'yellow';
            this.ctx.strokeRect(this.player.x, this.player.y, this.player.width * this.player.zoom, this.player.height * this.player.zoom);
            this.ctx.strokeStyle = 'blue';
            for (const platform of this.platforms) {
                const rect = platform.getRect();
                this.ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
            }
        }
    }

    gameLoop = (timestamp) => {
        this.updateAnimation(this.player.speed / 60);
        this.updatePhysics();
        this.render();
        requestAnimationFrame(this.gameLoop);
    };

    startGameLoop() {
        requestAnimationFrame(this.gameLoop);
    }

    updateSprite(spriteData) {
        this.loadSpriteData(spriteData);
    }

    onResize(width, height) {
        this.canvas.width = width;
        this.canvas.height = height;
        if (this.player.x > width - this.player.width * this.player.zoom) {
            this.player.x = width - this.player.width * this.player.zoom;
        }
        if (this.player.y > height - this.player.height * this.player.zoom) {
            this.player.y = height - this.player.height * this.player.zoom;
        }
    }

    toggleDebug() {
        this.debug = !this.debug;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = GameEngine;
}