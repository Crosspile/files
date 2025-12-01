
        import * as THREE from 'three';

        export class BubbleShooterGame {
            constructor(engine) {
                this.engine = engine;
                this.grid = [];
                this.particles = [];
                this.cannonBubble = null;
                this.nextBubble = null;
                this.shotProjectile = null;
                this.GRID_W = 11; this.GRID_H = 15; this.HEX_SIZE = 1.0; this.HEX_RADIUS = 0.58; this.Y_SPACING = 0.866; 
                this.WALL_LEFT = -0.7; this.WALL_RIGHT = (this.GRID_W - 1) + 0.7; this.WALL_TOP = (this.GRID_H - 1) * this.Y_SPACING + 0.75;
                this.PALETTE = [0xff0055, 0xffcc00, 0x00ff66, 0x00ccff, 0x9900ff, 0xff3300];
                this.score = 0; this.rowOffset = 0; this.shotsUntilDrop = 8; this.isShooting = false;
                this.groupBoard = new THREE.Group();
                this.baseCamPos = new THREE.Vector3(5.0, 4.0, 20);
                this.guideLineMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3 });
                this.ghostGeo = new THREE.CylinderGeometry(this.HEX_RADIUS, this.HEX_RADIUS, 0.1, 6).rotateX(Math.PI/2).rotateZ(Math.PI/3);
                this.ghostMat = new THREE.MeshBasicMaterial({ wireframe: true, transparent: true, opacity: 0.5 });
                
                this.input = new window.StandardInput(engine);
                this.aimTarget = new THREE.Vector3(0,0,0);
                this.lastTrace = null; 
            }

            init() {
                document.getElementById('game-title').innerText = "Bubble Shooter";
                document.getElementById('game-subtitle').innerText = "Match 3 | Avoid the Floor";
                document.getElementById('score-display').innerText = "Score: 0";
                document.getElementById('game-over-overlay').style.display = 'none';
                this.engine.scene.background = new THREE.Color(0x020205);
                this.engine.scene.add(this.groupBoard);
                this.engine.scene.add(new THREE.AmbientLight(0xffffff, 0.1));
                const dirLight = new THREE.DirectionalLight(0xffffff, 2);
                dirLight.position.set(5, 10, 20);
                this.engine.scene.add(dirLight);
                this.engine.camera.position.copy(this.baseCamPos);
                this.engine.camera.lookAt(5.0, 4.0, 0);
                this.shakeIntensity = 0;
                this.createWalls();
                this.createBackground();
                this.startNewGame();
                
                this.input.enable({
                    onAim: (pos) => { this.aimTarget.copy(pos); }, 
                    onAction: (pos) => this.tryShoot()
                });
            }

            cleanup() {
                this.grid = [];
                this.input.disable();
                this.engine.aimAssist.clear();
            }

            createWalls() {
                const wallGeo = new THREE.BoxGeometry(0.2, 40, 1);
                const wallMat = new THREE.MeshStandardMaterial({ color: 0x444444, emissive: 0x222244, roughness: 0.1, metalness: 0.8 });
                const left = new THREE.Mesh(wallGeo, wallMat); left.position.set(this.WALL_LEFT, 5, 0); this.engine.scene.add(left);
                const right = new THREE.Mesh(wallGeo, wallMat); right.position.set(this.WALL_RIGHT, 5, 0); this.engine.scene.add(right);
                const top = new THREE.Mesh(new THREE.BoxGeometry(this.WALL_RIGHT - this.WALL_LEFT + 0.2, 0.2, 1), wallMat); top.position.set((this.WALL_LEFT+this.WALL_RIGHT)/2, this.WALL_TOP, 0); this.engine.scene.add(top);
            }

            createBackground() {
                const geom = new THREE.BufferGeometry();
                const pos = [];
                for(let i=0; i<300; i++) { pos.push((Math.random()-0.5)*50 + 5); pos.push((Math.random()-0.5)*50 + 5); pos.push((Math.random()-0.5)*15 - 5); }
                geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
                const bg = new THREE.Points(geom, new THREE.PointsMaterial({ color: 0x445566, size: 0.1, transparent: true, opacity: 0.6 }));
                this.engine.scene.add(bg);
            }

            startNewGame() {
                this.score = 0; this.rowOffset = 0; this.shotsUntilDrop = 8; this.isShooting = false;
                document.getElementById('score-display').innerText = "Score: 0";
                while(this.groupBoard.children.length > 0) this.groupBoard.remove(this.groupBoard.children[0]);
                this.grid = Array(this.GRID_W).fill(null).map(() => Array(this.GRID_H).fill(null));
                for (let y = this.GRID_H - 1; y >= this.GRID_H - 6; y--) { 
                    for (let x = 0; x < this.GRID_W; x++) {
                        if (this.isRowOdd(y) && x >= this.GRID_W - 1) continue;
                        if (Math.random() > 0.3) this.createBubbleAt(x, y);
                    }
                }
                this.loadCannon();
            }

            createBubbleAt(x, y, type = null) {
                if (type === null) type = Math.floor(Math.random() * this.PALETTE.length);
                const geo = new THREE.CylinderGeometry(this.HEX_RADIUS, this.HEX_RADIUS, 0.25, 6);
                geo.rotateX(Math.PI/2); geo.rotateZ(Math.PI/3);
                const mat = new THREE.MeshPhongMaterial({ color: this.PALETTE[type], emissive: this.PALETTE[type], emissiveIntensity: 0.2, shininess: 100 });
                const mesh = new THREE.Mesh(geo, mat);
                const pos = this.gridToWorld(x, y);
                mesh.position.set(pos.x, pos.y, 0);
                const bubble = { x, y, type, mesh, id: Math.random().toString(), radius: this.HEX_RADIUS };
                this.grid[x][y] = bubble;
                this.groupBoard.add(mesh);
                return bubble;
            }

            loadCannon() {
                const type = this.nextBubble ? this.nextBubble.type : Math.floor(Math.random() * this.PALETTE.length);
                if (this.cannonBubble?.mesh) this.groupBoard.remove(this.cannonBubble.mesh);
                const geo = new THREE.CylinderGeometry(this.HEX_RADIUS, this.HEX_RADIUS, 0.25, 6).rotateX(Math.PI/2).rotateZ(Math.PI/3);
                const mat = new THREE.MeshPhongMaterial({ color: this.PALETTE[type], emissive: this.PALETTE[type], emissiveIntensity: 0.5, shininess: 100 });
                const cx = 5.0, cy = -2.0;
                const mesh = new THREE.Mesh(geo, mat);
                mesh.position.set(cx, cy, 0);
                this.cannonBubble = { type, mesh, wx: cx, wy: cy };
                this.groupBoard.add(mesh);
                if (this.nextBubble?.mesh) this.groupBoard.remove(this.nextBubble.mesh);
                const nType = Math.floor(Math.random() * this.PALETTE.length);
                const nMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.25, 6).rotateX(Math.PI/2).rotateZ(Math.PI/3), new THREE.MeshPhongMaterial({ color: this.PALETTE[nType], emissive: this.PALETTE[nType], emissiveIntensity: 0.3 }));
                nMesh.position.set(8.5, -2.0, 0);
                this.nextBubble = { type: nType, mesh: nMesh };
                this.groupBoard.add(nMesh);
            }

            isRowOdd(y) { return (y + this.rowOffset) % 2 !== 0; }
            gridToWorld(gx, gy) {
                const isOdd = this.isRowOdd(gy);
                const wx = (isOdd ? gx + 0.5 : gx) * this.HEX_SIZE;
                const wy = gy * this.Y_SPACING;
                return { x: wx, y: wy };
            }
            worldToGrid(wx, wy) {
                const gy = Math.round(wy / this.Y_SPACING);
                const isOdd = this.isRowOdd(gy);
                const gx = Math.round(isOdd ? (wx / this.HEX_SIZE) - 0.5 : wx / this.HEX_SIZE);
                return { x: Math.max(0, Math.min(this.GRID_W - (isOdd?1:0) - 1, gx)), y: Math.max(0, Math.min(this.GRID_H - 1, gy)) };
            }

            update() {
                if (this.shakeIntensity > 0.001) {
                    this.engine.camera.position.x = this.baseCamPos.x + (Math.random()-0.5)*this.shakeIntensity;
                    this.engine.camera.position.y = this.baseCamPos.y + (Math.random()-0.5)*this.shakeIntensity;
                    this.shakeIntensity *= 0.92;
                } else {
                    this.engine.camera.position.copy(this.baseCamPos);
                }

                if (!this.isShooting) {
                    this.updateAimer();
                }

                for(let i=this.particles.length-1; i>=0; i--) {
                    let p = this.particles[i];
                    p.mesh.position.add(p.vel);
                    p.mesh.rotation.x += 0.1;
                    p.life -= 0.03;
                    p.mesh.scale.setScalar(p.life);
                    if(p.life <= 0) {
                        this.engine.scene.remove(p.mesh);
                        this.particles.splice(i,1);
                    }
                }
            }

            tryShoot() {
                if (this.isShooting || !this.cannonBubble?.targetGrid) return;
                if (!this.lastTrace || !this.lastTrace.points.length) return;

                this.isShooting = true;
                this.shakeIntensity = 0.1;
                this.engine.aimAssist.clear();

                // Use Engine Path Animator
                this.engine.animator.add(
                    this.cannonBubble.mesh,
                    [...this.lastTrace.points], 
                    0.4, 
                    () => this.finalizeShot()
                );
            }

            async finalizeShot() {
                const targetGrid = this.cannonBubble.targetGrid;
                
                this.cannonBubble.mesh.rotation.set(Math.PI/2, 0, Math.PI/3);
                this.createBubbleAt(targetGrid.x, targetGrid.y, this.cannonBubble.type);
                this.groupBoard.remove(this.cannonBubble.mesh);
                
                await this.checkMatches(targetGrid.x, targetGrid.y, this.cannonBubble.type);
                
                if (targetGrid.y === 0) {
                    document.getElementById('final-score').innerText = "Score: " + this.score;
                    document.getElementById('game-over-overlay').style.display = 'block';
                    return;
                }
                this.shotsUntilDrop--;
                if (this.shotsUntilDrop <= 0) {
                    this.addNewRow();
                    this.shotsUntilDrop = 8;
                }
                this.isShooting = false;
                this.loadCannon();
            }

            updateAimer() {
                this.engine.aimAssist.beginFrame();
                const worldM = this.aimTarget;

                const start = { x: this.cannonBubble.wx, y: this.cannonBubble.wy };
                if (worldM.y < start.y) return;

                const dx = worldM.x - start.x;
                const dy = worldM.y - start.y;
                const dist = Math.sqrt(dx*dx+dy*dy);
                const stepSize = this.HEX_RADIUS * 1.5;
                const vel = { x: (dx/dist)*stepSize, y: (dy/dist)*stepSize };

                const obstacles = [];
                for(let x=0; x<this.GRID_W; x++) {
                    for(let y=0; y<this.GRID_H; y++) {
                        const b = this.grid[x][y];
                        if(b) obstacles.push({ x: b.mesh.position.x, y: b.mesh.position.y, radius: this.HEX_RADIUS, data: b });
                    }
                }
                const bounds = { xMin: this.WALL_LEFT, xMax: this.WALL_RIGHT, yMin: -100, yMax: this.WALL_TOP };
                
                const result = this.engine.basicPhysics.simulate(
                    new THREE.Vector3(start.x, start.y, 0), 
                    new THREE.Vector3(vel.x, vel.y, 0), 
                    this.HEX_RADIUS, 
                    bounds, 
                    obstacles,
                    { hitRadiusScale: 0.85, wallRestitution: 1.0 }
                );
                
                this.lastTrace = result;
                this.engine.aimAssist.drawLine(result.points, this.guideLineMat);

                if (result.hit && result.hit.type === 'obstacle') {
                    const hitBubble = result.hit.object.data;
                    const emptyNeighbor = this.findEmptyNeighbor(hitBubble.x, hitBubble.y, result.hit.position);
                    if(emptyNeighbor) {
                        const pos = this.gridToWorld(emptyNeighbor.x, emptyNeighbor.y);
                        this.ghostMat.color.setHex(this.PALETTE[this.cannonBubble.type]);
                        this.engine.aimAssist.drawGhost(new THREE.Vector3(pos.x, pos.y, 0), this.ghostGeo, this.ghostMat);
                        this.cannonBubble.targetGrid = emptyNeighbor;
                    }
                } else if (result.hit === null && result.points.length > 0) {
                     const lastPt = result.points[result.points.length-1];
                     if (lastPt.y > this.WALL_TOP - 1.5) { 
                         const gridPos = this.worldToGrid(lastPt.x, lastPt.y);
                         if (!this.grid[gridPos.x]?.[gridPos.y]) {
                             const pos = this.gridToWorld(gridPos.x, gridPos.y);
                             this.ghostMat.color.setHex(this.PALETTE[this.cannonBubble.type]);
                             this.engine.aimAssist.drawGhost(new THREE.Vector3(pos.x, pos.y, 0), this.ghostGeo, this.ghostMat);
                             this.cannonBubble.targetGrid = gridPos;
                         }
                     }
                }
            }

            findEmptyNeighbor(gx, gy, hitPos) {
                const neighbors = this.getNeighbors(gx, gy);
                let bestN = null; let minDist = Infinity;
                for(let n of neighbors) {
                    if (this.grid[n.x]?.[n.y]) continue; 
                    const pos = this.gridToWorld(n.x, n.y);
                    const d = (pos.x - hitPos.x)**2 + (pos.y - hitPos.y)**2;
                    if(d < minDist) { minDist = d; bestN = n; }
                }
                return bestN;
            }

            checkMatches(x, y, type) {
                 const start = this.grid[x][y];
                 if(!start) return;
                 const q = [start];
                 const matched = new Set([start.id]);
                 const toPop = [start];
                 while(q.length) {
                     const c = q.shift();
                     const n = this.getNeighbors(c.x, c.y);
                     for(let nb of n) {
                         const b = this.grid[nb.x]?.[nb.y];
                         if(b && b.type === type && !matched.has(b.id)) {
                             matched.add(b.id);
                             q.push(b);
                             toPop.push(b);
                         }
                     }
                 }
                 if(toPop.length >= 3) {
                     this.score += toPop.length * 100;
                     document.getElementById('score-display').innerText = "Score: " + this.score;
                     toPop.forEach(b => this.popBubble(b));
                     this.handleFloating();
                 }
            }
            
            getNeighbors(x,y) {
                const isOdd = this.isRowOdd(y);
                const offsets = [[1, 0], [-1, 0], [0, 1], [0, -1], [isOdd ? 1 : -1, 1], [isOdd ? 1 : -1, -1]];
                const res = [];
                for(let o of offsets) {
                    const nx = x+o[0], ny = y+o[1];
                    if(nx>=0 && nx<this.GRID_W && ny>=0 && ny<this.GRID_H) {
                        const nIsOdd = this.isRowOdd(ny);
                        if(nx < this.GRID_W - (nIsOdd?1:0)) res.push({x:nx, y:ny});
                    }
                }
                return res;
            }

            popBubble(b, isDrop=false) {
                if(this.grid[b.x][b.y] === b) this.grid[b.x][b.y] = null;
                this.groupBoard.remove(b.mesh);
                const color = this.PALETTE[b.type];
                for(let i=0; i<8; i++) {
                    const pGeo = new THREE.BoxGeometry(0.1,0.1,0.1);
                    const pMat = new THREE.MeshBasicMaterial({color: color});
                    const p = new THREE.Mesh(pGeo, pMat);
                    p.position.copy(b.mesh.position);
                    p.position.x += (Math.random()-0.5)*0.5;
                    p.position.y += (Math.random()-0.5)*0.5;
                    const vel = new THREE.Vector3((Math.random()-0.5)*0.3, (Math.random()-0.5)*0.3, (Math.random()-0.5)*0.3);
                    if(isDrop) vel.y -= 0.15;
                    this.particles.push({mesh:p, vel, life:1.0 + Math.random()*0.5});
                    this.engine.scene.add(p);
                }
            }

            handleFloating() {
                const connected = new Set();
                const q = [];
                const topY = this.GRID_H - 1;
                for(let x=0; x<this.GRID_W; x++) if(this.grid[x][topY]) { q.push(this.grid[x][topY]); connected.add(this.grid[x][topY].id); }
                while(q.length) {
                    const c = q.shift();
                    const n = this.getNeighbors(c.x, c.y);
                    for(let nb of n) {
                        const b = this.grid[nb.x]?.[nb.y];
                        if(b && !connected.has(b.id)) { connected.add(b.id); q.push(b); }
                    }
                }
                let dropped = false;
                for(let x=0; x<this.GRID_W; x++) for(let y=0; y<this.GRID_H; y++) {
                    const b = this.grid[x][y];
                    if(b && !connected.has(b.id)) { this.popBubble(b, true); dropped = true; this.score += 200; }
                }
                if(dropped) document.getElementById('score-display').innerText = "Score: " + this.score;
            }

            addNewRow() {
                 for(let x=0; x<this.GRID_W; x++) if(this.grid[x][0]) {
                     document.getElementById('final-score').innerText = "Score: " + this.score;
                     document.getElementById('game-over-overlay').style.display = 'block';
                     return;
                 }
                 for(let y=0; y<this.GRID_H-1; y++) for(let x=0; x<this.GRID_W; x++) { const b = this.grid[x][y+1]; this.grid[x][y] = b; if(b) b.y = y; }
                 this.rowOffset++;
                 for(let y=0; y<this.GRID_H-1; y++) for(let x=0; x<this.GRID_W; x++) { const b = this.grid[x][y]; if(b) { const pos = this.gridToWorld(b.x, b.y); b.mesh.position.set(pos.x, pos.y, 0); } }
                 const topY = this.GRID_H-1;
                 for(let x=0; x<this.GRID_W; x++) { this.grid[x][topY] = null; const isOdd = this.isRowOdd(topY); if (x < this.GRID_W - (isOdd?1:0) && Math.random() > 0.3) { this.createBubbleAt(x, topY); } }
                 this.handleFloating();
            }
        }
        
        // EXPORT TO WINDOW FOR CONFIG
        window.BubbleShooterGame = BubbleShooterGame;
    