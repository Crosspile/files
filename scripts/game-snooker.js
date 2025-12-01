
        import * as THREE from 'three';

        export class SnookerGame {
            constructor(engine) {
                this.engine = engine;
                this.balls = [];
                this.pockets = [];
                this.cueBall = null;
                this.BALL_RADIUS = 0.4;
                this.FRICTION = 0.985;
                this.TABLE_W = 12;
                this.TABLE_H = 22;
                this.score = 0;
                
                this.cueStick = null;
                this.input = new window.SlingshotInput(engine);

                this.guideDashedMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4 });
                this.guideSolidMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 });
                this.guideDeflectMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 });
                this.ghostGeo = new THREE.SphereGeometry(this.BALL_RADIUS, 16, 16);
                this.ghostMat = new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.3 });
                this.highlightMatRed = new THREE.MeshBasicMaterial({ color: 0xff0000, side: THREE.DoubleSide, transparent: true, opacity: 0.8 });
                this.highlightMatGreen = new THREE.MeshBasicMaterial({ color: 0x00ff00, side: THREE.DoubleSide, transparent: true, opacity: 0.8 });
                
                this.pendingShot = null;
            }

            init() {
                document.getElementById('game-title').innerText = "Neon Snooker";
                document.getElementById('game-subtitle').innerText = "RxJS Input | Predictive Guide";
                document.getElementById('score-display').innerText = "Balls Sunk: 0";
                document.getElementById('game-over-overlay').style.display = 'none';

                this.engine.scene.background = new THREE.Color(0x0a1510);
                this.engine.camera.position.set(0, 0, 30);
                this.engine.camera.zoom = 0.8;
                this.engine.camera.updateProjectionMatrix();

                this.createTable();
                this.rackBalls();
                this.createCueStick();
                
                this.input.enable({
                    canStart: () => Math.abs(this.cueBall.vx) < 0.01 && Math.abs(this.cueBall.vy) < 0.01,
                    calculateVector: (mousePos) => {
                        const dx = this.cueBall.x - mousePos.x;
                        const dy = this.cueBall.y - mousePos.y;
                        const angle = Math.atan2(dy, dx);
                        const force = Math.min(Math.sqrt(dx*dx + dy*dy), 5) * 0.15;
                        return { angle, force };
                    },
                    onAim: (data) => {
                        this.cueStick.visible = true;
                        this.cueStick.position.copy(this.cueBall.mesh.position);
                        this.cueStick.rotation.z = data.angle;
                        this.updateGuide(data.angle, data.force);
                        this.pendingShot = data;
                    },
                    onAction: () => {
                        if (this.pendingShot) {
                            const { angle, force } = this.pendingShot;
                            this.cueBall.vx = Math.cos(angle) * force;
                            this.cueBall.vy = Math.sin(angle) * force;
                            this.cueStick.visible = false;
                            this.engine.aimAssist.clear();
                            this.pockets.forEach(p => p.highlight.visible = false);
                            this.pendingShot = null;
                        }
                    }
                });
            }

            cleanup() {
                this.balls = [];
                this.pockets = [];
                this.input.disable();
                this.engine.aimAssist.clear();
            }

            createTable() {
                const matFelt = new THREE.MeshBasicMaterial({ color: 0x004411 });
                const matRail = new THREE.MeshBasicMaterial({ color: 0x221100 });
                const felt = new THREE.Mesh(new THREE.BoxGeometry(this.TABLE_W, this.TABLE_H, 0.5), matFelt);
                felt.position.z = -0.5;
                this.engine.scene.add(felt);

                const thickness = 1;
                const w = this.TABLE_W/2 + thickness/2, h = this.TABLE_H/2 + thickness/2;
                this.addCushion(w, 0, thickness, this.TABLE_H + thickness*2, matRail); 
                this.addCushion(-w, 0, thickness, this.TABLE_H + thickness*2, matRail);
                this.addCushion(0, h, this.TABLE_W, thickness, matRail);
                this.addCushion(0, -h, this.TABLE_W, thickness, matRail);

                const pX = this.TABLE_W/2 - 0.2, pY = this.TABLE_H/2 - 0.2;
                const coords = [[-pX, -pY], [pX, -pY], [-pX, 0], [pX, 0], [-pX, pY], [pX, pY]];
                coords.forEach(c => this.addPocket(c[0], c[1]));
            }

            addCushion(x, y, w, h, mat) {
                const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, 1), mat);
                mesh.position.set(x, y, 0);
                this.engine.scene.add(mesh);
            }

            addPocket(x, y) {
                const mesh = new THREE.Mesh(new THREE.CircleGeometry(0.7, 16), new THREE.MeshBasicMaterial({ color: 0x000000 }));
                mesh.position.set(x, y, 0.01);
                this.engine.scene.add(mesh);
                const ring = new THREE.Mesh(new THREE.RingGeometry(0.75, 0.95, 32), new THREE.MeshBasicMaterial({ color: 0x00ff00, side: THREE.DoubleSide, transparent: true, opacity: 0.8 }));
                ring.position.set(x, y, 0.02);
                ring.visible = false;
                this.engine.scene.add(ring);
                this.pockets.push({ x, y, r: 0.7, highlight: ring });
            }

            rackBalls() {
                this.cueBall = this.createBall(0, -this.TABLE_H * 0.25, 0xffffff);
                let startY = this.TABLE_H * 0.25;
                const gap = 0.05;
                for (let r = 0; r < 5; r++) {
                    const rowY = startY + r * (this.BALL_RADIUS * 2 * 0.866 + gap);
                    const startX = -(r * (this.BALL_RADIUS + gap));
                    for (let c = 0; c <= r; c++) {
                        this.createBall(startX + c * (this.BALL_RADIUS * 2 + gap * 2), rowY, 0xff0000);
                    }
                }
                this.createBall(0, startY - 2, 0x000000); 
                this.createBall(0, startY - 8, 0x0000ff); 
                this.createBall(0, -this.TABLE_H * 0.35, 0x884400); 
            }

            createBall(x, y, color) {
                const mesh = new THREE.Mesh(new THREE.SphereGeometry(this.BALL_RADIUS, 16, 16), new THREE.MeshBasicMaterial({ color: color }));
                mesh.position.set(x, y, this.BALL_RADIUS);
                this.engine.scene.add(mesh);
                const ball = { mesh, x, y, vx: 0, vy: 0, active: true, color, radius: this.BALL_RADIUS };
                this.balls.push(ball);
                return ball;
            }

            createCueStick() {
                const geo = new THREE.CylinderGeometry(0.05, 0.1, 8, 8);
                geo.rotateZ(Math.PI / 2); 
                geo.translate(-4.5, 0, 0); 
                this.cueStick = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xddaa88 }));
                this.cueStick.visible = false;
                this.engine.scene.add(this.cueStick);
            }

            clipLineToTable(p1, p2) {
                const r = this.BALL_RADIUS;
                const minX = -this.TABLE_W/2 + r;
                const maxX = this.TABLE_W/2 - r;
                const minY = -this.TABLE_H/2 + r;
                const maxY = this.TABLE_H/2 - r;
                const dir = new THREE.Vector3().subVectors(p2, p1);
                let t = 1.0;
                // Clip against 4 walls
                if (p2.x > maxX) t = Math.min(t, (maxX - p1.x) / dir.x);
                else if (p2.x < minX) t = Math.min(t, (minX - p1.x) / dir.x);
                if (p2.y > maxY) t = Math.min(t, (maxY - p1.y) / dir.y);
                else if (p2.y < minY) t = Math.min(t, (minY - p1.y) / dir.y);
                
                // Return clipped point
                if (t < 0) t = 0; // Sanity check
                return new THREE.Vector3(p1.x + dir.x * t, p1.y + dir.y * t, 0);
            }

            updateGuide(angle, power) {
                this.engine.aimAssist.beginFrame();
                this.pockets.forEach(p => p.highlight.visible = false);

                const startPos = new THREE.Vector3(this.cueBall.x, this.cueBall.y, 0);
                const velocity = new THREE.Vector3(Math.cos(angle) * power, Math.sin(angle) * power, 0);
                const r = this.BALL_RADIUS;
                const bounds = { xMin: -this.TABLE_W/2, xMax: this.TABLE_W/2, yMin: -this.TABLE_H/2, yMax: this.TABLE_H/2 };
                const obstacles = this.balls.filter(b => b !== this.cueBall && b.active);

                // USE SNOOKER PHYSICS (Friction, Inelastic Bounce)
                const result = this.engine.snookerPhysics.simulate(
                    startPos, 
                    velocity, 
                    r, 
                    bounds, 
                    obstacles, 
                    { friction: this.FRICTION, wallRestitution: 0.8 }
                );
                
                this.engine.aimAssist.drawLine(result.points, this.guideDashedMat);

                if (result.points.length > 0) {
                     const endPt = result.points[result.points.length-1];
                     if (result.hit || result.finalVelocity.length() < 0.01) {
                         this.engine.aimAssist.drawGhost(new THREE.Vector3(endPt.x, endPt.y, r), this.ghostGeo, this.ghostMat);
                     }
                }

                if (result.hit && result.hit.type === 'obstacle') {
                    const hitBall = result.hit.object;
                    const hitPos = result.hit.position;
                    const impactNormal = result.hit.normal; 
                    const pushDir = impactNormal.clone().negate();
                    
                    // 1. Target Ball Path (Clipped)
                    let tStart = new THREE.Vector3(hitBall.x, hitBall.y, 0);
                    let tEnd = tStart.clone().add(pushDir.multiplyScalar(10));
                    tEnd = this.clipLineToTable(tStart, tEnd);
                    this.engine.aimAssist.drawLine([tStart, tEnd], this.guideSolidMat);
                    
                    // 2. Cue Ball Deflection (Clipped)
                    const tangent = new THREE.Vector3(-pushDir.y, pushDir.x, 0);
                    let dStart = hitPos;
                    let dEnd = hitPos.clone().add(tangent.multiplyScalar(2.5));
                    dEnd = this.clipLineToTable(dStart, dEnd); 
                    this.engine.aimAssist.drawLine([dStart, dEnd], this.guideDeflectMat);

                    for(let p of this.pockets) {
                        if((tEnd.x-p.x)**2 + (tEnd.y-p.y)**2 < 2.0) { p.highlight.material = this.highlightMatGreen; p.highlight.visible = true; }
                    }
                }
            }

            update() {
                let moving = false;
                for(let b of this.balls) {
                    if(!b.active) continue;
                    if(Math.abs(b.vx) > 0.001 || Math.abs(b.vy) > 0.001) {
                        moving = true;
                        b.x += b.vx; b.y += b.vy;
                        b.vx *= this.FRICTION; b.vy *= this.FRICTION;

                        const r = this.BALL_RADIUS, w = this.TABLE_W/2, h = this.TABLE_H/2;
                        if (b.x > w-r) { b.x = w-r; b.vx *= -0.8; }
                        else if (b.x < -w+r) { b.x = -w+r; b.vx *= -0.8; }
                        if (b.y > h-r) { b.y = h-r; b.vy *= -0.8; }
                        else if (b.y < -h+r) { b.y = -h+r; b.vy *= -0.8; }

                        for(let p of this.pockets) {
                            if((b.x-p.x)**2 + (b.y-p.y)**2 < p.r**2) {
                                b.active = false; b.mesh.visible = false; b.vx = 0; b.vy = 0;
                                if(b === this.cueBall) { setTimeout(() => { b.active = true; b.mesh.visible = true; b.x = 0; b.y = -this.TABLE_H * 0.25; }, 1000); } 
                                else { this.score++; document.getElementById('score-display').innerText = "Balls Sunk: " + this.score; }
                            }
                        }
                    }
                    b.mesh.position.set(b.x, b.y, this.BALL_RADIUS);
                }

                for(let i=0; i<this.balls.length; i++) {
                    for(let j=i+1; j<this.balls.length; j++) {
                        const b1 = this.balls[i], b2 = this.balls[j];
                        if(!b1.active || !b2.active) continue;
                        const dx = b2.x - b1.x, dy = b2.y - b1.y;
                        const dist = Math.sqrt(dx*dx + dy*dy);
                        if(dist < this.BALL_RADIUS*2) {
                            const overlap = (this.BALL_RADIUS*2 - dist)/2;
                            const nx = dx/dist, ny = dy/dist;
                            b1.x -= nx*overlap; b1.y -= ny*overlap;
                            b2.x += nx*overlap; b2.y += ny*overlap;
                            const dvx = b1.vx - b2.vx, dvy = b1.vy - b2.vy;
                            const dot = dvx*nx + dvy*ny;
                            if(dot > 0) { b1.vx -= nx*dot; b1.vy -= ny*dot; b2.vx += nx*dot; b2.vy += ny*dot; }
                        }
                    }
                }
            }
        }
        
        // EXPORT TO WINDOW FOR CONFIG
        window.SnookerGame = SnookerGame;
    