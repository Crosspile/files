   
        import * as THREE from 'three';
        import { fromEvent } from 'rxjs';
        import { switchMap, takeUntil, map, tap, filter } from 'rxjs';

        // --- SUB-SYSTEM: VISUALS ---
        export class AimAssistSystem {
            constructor(scene) {
                this.scene = scene;
                this.group = new THREE.Group();
                this.scene.add(this.group);
                this.linePool = [];
                this.ghostPool = [];
                this.activeLines = 0;
                this.activeGhosts = 0;
            }
            beginFrame() {
                this.group.visible = true;
                this.activeLines = 0; this.activeGhosts = 0;
                this.linePool.forEach(l => l.visible = false);
                this.ghostPool.forEach(g => g.visible = false);
            }
            drawLine(points, material) {
                let line = this.linePool[this.activeLines];
                if (!line) {
                    line = new THREE.Line(new THREE.BufferGeometry(), material);
                    line.frustumCulled = false;
                    this.linePool.push(line);
                    this.group.add(line);
                }
                line.material = material;
                line.geometry.setFromPoints(points);
                if (material instanceof THREE.LineDashedMaterial) line.computeLineDistances();
                line.visible = true;
                this.activeLines++;
                return line;
            }
            drawGhost(position, geometry, material) {
                let ghost = this.ghostPool[this.activeGhosts];
                if (!ghost) {
                    ghost = new THREE.Mesh(geometry, material);
                    this.ghostPool.push(ghost);
                    this.group.add(ghost);
                }
                ghost.geometry = geometry;
                ghost.material = material;
                ghost.position.copy(position);
                ghost.visible = true;
                this.activeGhosts++;
                return ghost;
            }
            clear() { this.beginFrame(); this.group.visible = false; }
        }

        // --- SUB-SYSTEM: ANIMATION ---
        export class PathAnimator {
            constructor() { this.active = []; }
            add(mesh, path, speed, onComplete) {
                this.active.push({ mesh, path, speed, onComplete, segmentIdx: 0, t: 0 });
            }
            update() {
                for (let i = this.active.length - 1; i >= 0; i--) {
                    const p = this.active[i];
                    const p1 = p.path[p.segmentIdx];
                    const p2 = p.path[p.segmentIdx + 1];
                    if (p2) {
                        const dist = p1.distanceTo(p2);
                        const tStep = p.speed / dist;
                        p.t += tStep;
                        if (p.t >= 1.0) {
                            p.t = 0; p.segmentIdx++; p.mesh.position.copy(p2);
                            if (p.segmentIdx >= p.path.length - 1) {
                                if(p.onComplete) p.onComplete();
                                this.active.splice(i, 1);
                            }
                        } else {
                            p.mesh.position.lerpVectors(p1, p2, p.t);
                            p.mesh.rotation.z += 0.2; 
                        }
                    } else {
                        if(p.onComplete) p.onComplete();
                        this.active.splice(i, 1);
                    }
                }
            }
            clear() { this.active = []; }
        }

        // --- SUB-SYSTEM: INPUT ---
        export class StandardInput {
            constructor(engine) { this.engine = engine; this.subs = []; }
            getWorldPos(e) { return this.engine.getMouseWorld(e.clientX, e.clientY); }
            enable(callbacks) {
                this.subs.push(fromEvent(document, 'mousemove').subscribe(e => { if (callbacks.onAim) callbacks.onAim(this.getWorldPos(e)); }));
                this.subs.push(fromEvent(document, 'mousedown').subscribe(e => { if (callbacks.onAction) callbacks.onAction(this.getWorldPos(e)); }));
            }
            disable() { this.subs.forEach(s => s.unsubscribe()); this.subs = []; }
        }

        export class SlingshotInput extends StandardInput {
            enable(callbacks) {
                const mouseUp$ = fromEvent(document, 'mouseup');
                this.subs.push(fromEvent(document, 'mousedown').pipe(
                    filter(() => callbacks.canStart ? callbacks.canStart() : true),
                    switchMap(() => fromEvent(document, 'mousemove').pipe(
                        map(e => {
                            const m = this.getWorldPos(e);
                            return { ...callbacks.calculateVector(m), rawMouse: m };
                        }),
                        tap(data => { if (callbacks.onAim) callbacks.onAim(data); }),
                        takeUntil(mouseUp$.pipe(tap(() => { if (callbacks.onAction) callbacks.onAction(); })))
                    ))
                ).subscribe());
            }
        }

        // --- SUB-SYSTEM: PHYSICS ---
        export class BasicPhysics {
            constructor() { this.maxSteps = 800; }
            checkWalls(curX, curY, vx, vy, r, bounds) {
                let tMin = 1.0, norm = null;
                if (vx < 0) { const t = (bounds.xMin + r - curX) / vx; if (t >= 0 && t < tMin) { tMin = t; norm = 'x'; } }
                if (vx > 0) { const t = (bounds.xMax - r - curX) / vx; if (t >= 0 && t < tMin) { tMin = t; norm = 'x'; } }
                if (vy < 0) { const t = (bounds.yMin + r - curY) / vy; if (t >= 0 && t < tMin) { tMin = t; norm = 'y'; } }
                if (vy > 0) { const t = (bounds.yMax - r - curY) / vy; if (t >= 0 && t < tMin) { tMin = t; norm = 'y'; } }
                return { t: tMin, norm };
            }
            checkObstacles(curX, curY, stepX, stepY, r, obstacles, hitScale) {
                let bestT = 1.0, bestObj = null;
                const dx = stepX - curX, dy = stepY - curY;
                const A = dx*dx + dy*dy;
                if (A < 0.000001) return { t: 1.0, obj: null }; 
                for (let obj of obstacles) {
                    const ox = curX - obj.x, oy = curY - obj.y;
                    const rSum = (r * hitScale) + (obj.radius * hitScale);
                    const distSq = (ox + dx)**2 + (oy + dy)**2;
                    if (distSq > (Math.sqrt(A) + rSum + 2)**2) continue; 
                    const B = 2 * (ox*dx + oy*dy);
                    const C = (ox*ox + oy*oy) - rSum*rSum;
                    const det = B*B - 4*A*C;
                    if (det >= 0) {
                        const t = (-B - Math.sqrt(det)) / (2*A);
                        if (t >= 0 && t <= 1.0 && t < bestT) { bestT = t; bestObj = obj; }
                    }
                }
                return { t: bestT, obj: bestObj };
            }
            applyForces(vx, vy, config) { return { x: vx, y: vy }; }
            simulate(startPos, velocity, radius, bounds, obstacles, config = {}) {
                const hitScale = config.hitRadiusScale ?? 1.0;
                const restitution = config.wallRestitution ?? 1.0;
                let curX = startPos.x, curY = startPos.y;
                let vx = velocity.x, vy = velocity.y;
                const points = [new THREE.Vector3(curX, curY, 0)];
                let hitData = null;
                for (let i = 0; i < this.maxSteps; i++) {
                    const wall = this.checkWalls(curX, curY, vx, vy, radius, bounds);
                    let stepX = (wall.t < 1.0) ? curX + vx*wall.t : curX + vx;
                    let stepY = (wall.t < 1.0) ? curY + vy*wall.t : curY + vy;
                    const obs = this.checkObstacles(curX, curY, stepX, stepY, radius, obstacles, hitScale);
                    if (obs.obj) {
                        curX += (stepX - curX) * obs.t; curY += (stepY - curY) * obs.t;
                        points.push(new THREE.Vector3(curX, curY, 0));
                        const dx = curX - obs.obj.x, dy = curY - obs.obj.y;
                        const len = Math.sqrt(dx*dx + dy*dy);
                        hitData = { position: new THREE.Vector3(curX, curY, 0), normal: new THREE.Vector3(dx/len, dy/len, 0), object: obs.obj, type: 'obstacle' };
                        break; 
                    } else if (wall.t < 1.0) {
                        curX = stepX; curY = stepY;
                        points.push(new THREE.Vector3(curX, curY, 0));
                        if (wall.norm === 'x') vx *= -restitution; else vy *= -restitution;
                        curX += vx * 0.001; curY += vy * 0.001; 
                    } else { curX += vx; curY += vy; }
                    const newV = this.applyForces(vx, vy, config);
                    vx = newV.x; vy = newV.y;
                    if (Math.abs(vx) < 0.001 && Math.abs(vy) < 0.001) break;
                    if (i % 5 === 0) points.push(new THREE.Vector3(curX, curY, 0));
                }
                if (!hitData && points[points.length-1].distanceToSquared(new THREE.Vector3(curX, curY, 0)) > 0.01) points.push(new THREE.Vector3(curX, curY, 0));
                return { points, hit: hitData, finalVelocity: new THREE.Vector3(vx, vy, 0) };
            }
        }

        export class SnookerPhysics extends BasicPhysics {
            applyForces(vx, vy, config) {
                const f = config.friction || 1.0;
                return { x: vx * f, y: vy * f };
            }
        }

        // --- MAIN ENGINE CONTROLLER ---
        export class GameEngine {
            constructor() {
                this.scene = null; this.camera = null; this.renderer = null;
                this.activeGame = null; this.requestId = null;
                this.raycaster = new THREE.Raycaster(); this.mouse = new THREE.Vector2();
                this.aimAssist = null; this.animator = null; 
                this.basicPhysics = new BasicPhysics();
                this.snookerPhysics = new SnookerPhysics();
                this.registeredGames = {}; 
                this.initThreeJS();
                window.addEventListener('resize', () => this.onResize());
            }

            initThreeJS() {
                this.scene = new THREE.Scene();
                this.scene.background = new THREE.Color(0x050710);
                this.aimAssist = new AimAssistSystem(this.scene);
                this.animator = new PathAnimator();
                const aspect = window.innerWidth / window.innerHeight;
                const frustumSize = 24; 
                this.camera = new THREE.OrthographicCamera(frustumSize * aspect / -2, frustumSize * aspect / 2, frustumSize / 2, frustumSize / -2, 1, 1000);
                this.camera.position.set(5, 5, 20); this.camera.lookAt(5, 5, 0);
                this.renderer = new THREE.WebGLRenderer({ antialias: true });
                this.renderer.setSize(window.innerWidth, window.innerHeight);
                this.renderer.setPixelRatio(window.devicePixelRatio);
                document.body.appendChild(this.renderer.domElement);
            }

            // Public API for Config Script
            registerGame(id, GameClass, title) {
                this.registeredGames[id] = { Class: GameClass, title };
                const container = document.getElementById('menu-buttons');
                const btn = document.createElement('button');
                btn.className = 'menu-btn';
                btn.innerText = title;
                btn.onclick = () => this.loadGame(id);
                container.appendChild(btn);
            }

            loadGame(id) {
                const entry = this.registeredGames[id];
                if (!entry) return;
                if (this.activeGame) this.stopGame();
                document.getElementById('main-menu').style.display = 'none';
                document.getElementById('game-ui').style.display = 'block';
                document.getElementById('back-btn').style.display = 'block';
                
                this.activeGame = new entry.Class(this);
                this.activeGame.init();
                if (!this.requestId) this.loop();
            }

            stopGame() {
                if (this.activeGame && this.activeGame.cleanup) this.activeGame.cleanup();
                this.activeGame = null;
                this.scene.children = this.scene.children.filter(c => c === this.aimAssist.group || c.isLight);
                this.aimAssist.clear();
                this.animator.clear();
                this.camera.position.set(0,0,20);
                this.camera.zoom = 1;
                this.camera.updateProjectionMatrix();
                this.scene.background = new THREE.Color(0x050710);
            }

            showMenu() {
                this.stopGame();
                document.getElementById('main-menu').style.display = 'flex';
                document.getElementById('game-ui').style.display = 'none';
                document.getElementById('back-btn').style.display = 'none';
                document.getElementById('game-over-overlay').style.display = 'none';
            }

            loop() {
                this.requestId = requestAnimationFrame(() => this.loop());
                this.animator.update();
                if(this.activeGame && this.activeGame.update) this.activeGame.update();
                this.renderer.render(this.scene, this.camera);
            }

            onResize() {
                const aspect = window.innerWidth / window.innerHeight;
                const frustumSize = 24;
                this.camera.left = -frustumSize * aspect / 2;
                this.camera.right = frustumSize * aspect / 2;
                this.camera.top = frustumSize / 2;
                this.camera.bottom = -frustumSize / 2;
                this.camera.updateProjectionMatrix();
                this.renderer.setSize(window.innerWidth, window.innerHeight);
                if(this.activeGame?.onResize) this.activeGame.onResize();
            }

            getMouseWorld(clientX, clientY) {
                this.mouse.x = (clientX / window.innerWidth) * 2 - 1;
                this.mouse.y = -(clientY / window.innerHeight) * 2 + 1;
                this.raycaster.setFromCamera(this.mouse, this.camera);
                const target = new THREE.Vector3();
                this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,0,1), 0), target);
                return target;
            }
        }
        
        // --- GLOBAL EXPORTS (For external game scripts) ---
        window.GameEngine = GameEngine;
        window.StandardInput = StandardInput;
        window.SlingshotInput = SlingshotInput;
        window.BasicPhysics = BasicPhysics;
        window.SnookerPhysics = SnookerPhysics;
        
        // Initialize Engine
        window.arcade = new GameEngine();
        window.app = window.arcade;