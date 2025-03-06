// engine.js
class GameEngine {
    constructor(canvasId, spriteData = {}) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.player = {
            x: 50,
            y: 300,
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
                walk: { frames: 1, width: 32, height: 32, speed: 0.1, startX: 0, startY: 0, paddingX: 0, paddingY: 0 }, // Ajout par défaut
                jump: { frames: 1, width: 32, height: 32, speed: 0.1, startX: 0, startY: 0, paddingX: 0, paddingY: 0 }  // Ajout par défaut
            },
            behaviors: {
                idle: { distanceX: 0, distanceY: 0 },
                walk: { distanceX: 5, distanceY: 0 },  // Ajout par défaut
                jump: { distanceX: 0, distanceY: -10 } // Ajout par défaut
            }
        };
        this.keys = { left: false, right: false, jump: false, jumpPressed: false };
        this.gravity = 0.5;
        this.transparencyTolerance = 20;

        // Appliquer les données du sprite passées en paramètre
        this.loadSpriteData(spriteData);

        this.setupEventListeners();
        this.startGameLoop();
    }

    loadSpriteData(spriteData) {
        if (spriteData.sprite) {
            const img = new Image();
            img.onload = () => {
                this.player.originalSprite = img;
                this.applyTransparency(img);
            };
            img.src = spriteData.sprite;
        }

        if (spriteData.parameters) {
            const params = spriteData.parameters;
            this.player.defaultFacingRight = params.defaultOrientation === 'right';
            this.player.facingRight = this.player.defaultFacingRight;
            this.player.transparentColor = params.transparentColor || '#FFFFFF';
            this.gravity = params.gravity || 0.5;
            this.player.zoom = params.zoom || 1.0;
            this.player.controls = params.controls || this.player.controls;
            this.player.animations = params.animations || this.player.animations;
            this.player.behaviors = params.behaviors || this.player.behaviors;

            // Ajouter les touches personnalisées dans keys
            Object.keys(this.player.controls).forEach(key => {
                this.keys[key] = false;
                if (key.startsWith('custom')) {
                    this.keys[`${key}Pressed`] = false;
                    this.keys[`${key}Triggered`] = false;
                }
            });
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

        for (let i = 0; i < data.length; i += 4) {
            const rDiff = Math.abs(data[i] - transparentRGB.r);
            const gDiff = Math.abs(data[i + 1] - transparentRGB.g);
            const bDiff = Math.abs(data[i + 2] - transparentRGB.b);
            if (rDiff <= this.transparencyTolerance && gDiff <= this.transparencyTolerance && bDiff <= this.transparencyTolerance) {
                data[i + 3] = 0;
            }
        }

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

        this.player.frameTimer += delta;
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

    updatePhysics() {
        const currentBehavior = this.player.behaviors[this.player.currentAnimation] || this.player.behaviors.idle;

        let totalDistanceX = 0;
        const walkDistanceX = this.player.behaviors.walk.distanceX || 5;
        if (this.keys.left && this.player.x > 0) {
            totalDistanceX -= walkDistanceX;
            this.player.facingRight = false;
        }
        if (this.keys.right && this.player.x < this.canvas.width - (this.player.width * this.player.zoom)) {
            totalDistanceX += walkDistanceX;
            this.player.facingRight = true;
        }
        if (this.player.currentAnimation === 'idle' || this.player.currentAnimation === 'jump' || this.player.currentAnimation.startsWith('custom')) {
            totalDistanceX += currentBehavior.distanceX;
        }
        this.player.x += totalDistanceX;

        if (this.keys.jump && !this.player.jumping) {
            this.player.velocityY = this.player.behaviors.jump.distanceY || -10;
            this.player.jumping = true;
        }

        if (this.player.jumping) {
            this.player.velocityY += this.gravity;
            this.player.y += this.player.velocityY;
        } else {
            this.player.velocityY += this.gravity;
            this.player.y += this.player.velocityY + currentBehavior.distanceY;
        }

        if (this.player.y > this.canvas.height - (this.player.height * this.player.zoom)) {
            this.player.y = this.canvas.height - (this.player.height * this.player.zoom);
            this.player.velocityY = 0;
            this.player.jumping = false;
        }
        if (this.player.y < 0) {
            this.player.y = 0;
            this.player.velocityY = 0;
        }
        if (this.player.x < 0) this.player.x = 0;
        if (this.player.x > this.canvas.width - (this.player.width * this.player.zoom)) {
            this.player.x = this.canvas.width - (this.player.width * this.player.zoom);
        }
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
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = GameEngine;
}