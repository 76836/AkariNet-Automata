// AkariNet Custom ATPK (Automaton Package) Loader
// Supports custom text-based format for easy code editing

(function() {
    'use strict';

    class ATPKParser {
        parse(content) {
            const lines = content.split('\n');
            const pkg = {
                name: null,
                description: null,
                automata: []
            };

            let i = 0;

            // Parse package metadata
            while (i < lines.length) {
                const line = lines[i].trim();
                
                if (line.startsWith('atpk-name:')) {
                    pkg.name = line.replace('atpk-name:', '').trim();
                } else if (line.startsWith('atpk-description:')) {
                    pkg.description = line.replace('atpk-description:', '').trim();
                } else if (line === '!AUTOMATON') {
                    // Start parsing automaton
                    const automaton = this.parseAutomaton(lines, i + 1);
                    if (automaton.success) {
                        pkg.automata.push(automaton.data);
                        i = automaton.nextIndex - 1; // -1 because loop will i++
                    } else {
                        throw new Error(`Failed to parse automaton at line ${i + 1}: ${automaton.error}`);
                    }
                }
                
                i++;
            }

            return pkg;
        }

        parseAutomaton(lines, startIndex) {
            const automaton = {
                name: null,
                version: null,
                description: null,
                author: null,
                priority: 100,
                respondsto: [],
                controls: [],
                dependencies: [],
                code: null
            };

            let i = startIndex;
            let inCode = false;
            let codeLines = [];

            while (i < lines.length) {
                const line = lines[i];
                const trimmed = line.trim();

                // Check for next automaton or end
                if (trimmed === '!AUTOMATON') {
                    break;
                }

                // Parse code block
                if (trimmed === 'code>') {
                    inCode = true;
                    i++;
                    continue;
                }

                if (trimmed === '<code') {
                    inCode = false;
                    automaton.code = codeLines.join('\n');
                    i++;
                    continue;
                }

                if (inCode) {
                    codeLines.push(line);
                    i++;
                    continue;
                }

                // Parse metadata fields
                if (trimmed.startsWith('name:')) {
                    automaton.name = trimmed.replace('name:', '').trim();
                } else if (trimmed.startsWith('version:')) {
                    automaton.version = trimmed.replace('version:', '').trim();
                } else if (trimmed.startsWith('description:')) {
                    automaton.description = trimmed.replace('description:', '').trim();
                } else if (trimmed.startsWith('author:')) {
                    automaton.author = trimmed.replace('author:', '').trim();
                } else if (trimmed.startsWith('priority:')) {
                    automaton.priority = parseInt(trimmed.replace('priority:', '').trim()) || 100;
                } else if (trimmed.startsWith('respondsto:')) {
                    const value = trimmed.replace('respondsto:', '').trim();
                    automaton.respondsto = value.split(',').map(s => s.trim()).filter(Boolean);
                } else if (trimmed.startsWith('controls:')) {
                    const value = trimmed.replace('controls:', '').trim();
                    automaton.controls = value.split(',').map(s => s.trim()).filter(Boolean);
                } else if (trimmed.startsWith('dependencies:')) {
                    const value = trimmed.replace('dependencies:', '').trim();
                    automaton.dependencies = value.split(',').map(s => s.trim()).filter(Boolean);
                }

                i++;
            }

            // Validate required fields
            if (!automaton.name || !automaton.version || !automaton.description || !automaton.code) {
                return {
                    success: false,
                    error: 'Missing required fields (name, version, description, code)',
                    nextIndex: i
                };
            }

            return {
                success: true,
                data: automaton,
                nextIndex: i
            };
        }
    }

    class AutomatonLoader {
        constructor() {
            this.automata = new Map();
            this.loadedPackages = [];
            this.blacklist = this.getBlacklist();
            this.parser = new ATPKParser();
        }

        getAutomataUrls() {
            const urls = localStorage.getItem('akari:automata_urls');
            return urls ? JSON.parse(urls) : [];
        }

        setAutomataUrls(urls) {
            localStorage.setItem('akari:automata_urls', JSON.stringify(urls));
        }

        getBlacklist() {
            const blacklist = localStorage.getItem('akari:automata_blacklist');
            return blacklist ? JSON.parse(blacklist) : [];
        }

        setBlacklist(blacklist) {
            localStorage.setItem('akari:automata_blacklist', JSON.stringify(blacklist));
            this.blacklist = blacklist;
        }

        isBlacklisted(automatonName) {
            return this.blacklist.includes(automatonName);
        }

        // Get list of running automata
        list() {
            return Array.from(this.automata.keys());
        }

        // Get info about a specific automaton
        info(name) {
            const entry = this.automata.get(name);
            if (!entry) {
                return null;
            }

            return {
                name: name,
                version: entry.metadata.version,
                description: entry.metadata.description,
                author: entry.metadata.author,
                priority: entry.metadata.priority,
                respondsto: entry.metadata.respondsto,
                controls: entry.metadata.controls,
                dependencies: entry.metadata.dependencies,
                sourceUrl: entry.sourceUrl,
                status: 'running'
            };
        }

        // Get info for all running automata
        listAll() {
            const result = [];
            for (const name of this.automata.keys()) {
                result.push(this.info(name));
            }
            return result;
        }

        // Shutdown an automaton (calls teardown)
        shutdown(name) {
            const entry = this.automata.get(name);
            if (!entry) {
                console.warn(`Automaton ${name} not found`);
                return false;
            }

            try {
                // Call teardown
                if (entry.instance.teardown) {
                    entry.instance.teardown();
                }

                // Remove from registry
                this.automata.delete(name);
                if (typeof AKARI !== 'undefined') {
                    AKARI.automata._registry.delete(name);
                }

                if (typeof emit !== 'undefined') {
                    emit('automaton_unloaded', { name, reason: 'shutdown' });
                }
                
                if (typeof log !== 'undefined') {
                    log('info', `Automaton shutdown: ${name}`);
                }

                return true;

            } catch (error) {
                console.error(`Error shutting down ${name}:`, error);
                if (typeof log !== 'undefined') {
                    log('error', `Failed to shutdown ${name}:`, error);
                }
                return false;
            }
        }

        // Kill an automaton (no teardown, force remove)
        kill(name) {
            const entry = this.automata.get(name);
            if (!entry) {
                console.warn(`Automaton ${name} not found`);
                return false;
            }

            try {
                // Force remove without teardown
                this.automata.delete(name);
                if (typeof AKARI !== 'undefined') {
                    AKARI.automata._registry.delete(name);
                }

                if (typeof emit !== 'undefined') {
                    emit('automaton_unloaded', { name, reason: 'killed' });
                }
                
                if (typeof log !== 'undefined') {
                    log('warn', `Automaton killed: ${name}`);
                }

                return true;

            } catch (error) {
                console.error(`Error killing ${name}:`, error);
                return false;
            }
        }

        // Restart an automaton
        async restart(name) {
            const entry = this.automata.get(name);
            if (!entry) {
                console.warn(`Automaton ${name} not found`);
                return false;
            }

            try {
                if (typeof log !== 'undefined') {
                    log('info', `Restarting automaton: ${name}`);
                }

                // Store metadata and source
                const metadata = entry.metadata;
                const sourceUrl = entry.sourceUrl;

                // Shutdown
                this.shutdown(name);

                // Wait a bit
                await this.wait(100);

                // Reload
                await this.loadAutomaton(metadata, sourceUrl);

                if (typeof log !== 'undefined') {
                    log('info', `Automaton restarted: ${name}`);
                }

                return true;

            } catch (error) {
                console.error(`Error restarting ${name}:`, error);
                if (typeof log !== 'undefined') {
                    log('error', `Failed to restart ${name}:`, error);
                }
                return false;
            }
        }

        async loadAll() {
            const urls = this.getAutomataUrls();
            
            if (urls.length === 0) {
                if (typeof log !== 'undefined') {
                    log('warn', 'No automata URLs configured. Add URLs in settings.');
                }
            }

            for (const url of urls) {
                try {
                    await this.loadPackage(url);
                } catch (error) {
                    console.error(`Failed to load package from ${url}:`, error);
                    if (typeof log !== 'undefined') {
                        log('error', `Failed to load package from ${url}:`, error);
                    }
                }
            }

            if (typeof log !== 'undefined') {
                log('info', `Loaded ${this.automata.size} automata from ${this.loadedPackages.length} packages`);
            }
        }

        async loadPackage(url) {
            try {
                if (typeof loadscreen !== 'undefined') {
                    loadscreen(`Loading ${url}...`);
                }
                
                if (typeof log !== 'undefined') {
                    log('info', `Loading package: ${url}`);
                }

                const response = await fetch(url);
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                const content = await response.text();
                const packageData = this.parser.parse(content);

                // Sort automata by priority and dependencies
                const sorted = this.sortAutomata(packageData.automata);

                // Load each automaton (skip blacklisted)
                let loadedCount = 0;
                for (const def of sorted) {
                    if (this.isBlacklisted(def.name)) {
                        if (typeof log !== 'undefined') {
                            log('info', `Skipping blacklisted automaton: ${def.name}`);
                        }
                        continue;
                    }
                    
                    await this.loadAutomaton(def, url);
                    loadedCount++;
                }

                this.loadedPackages.push({ url, automata: loadedCount });
                
                if (typeof log !== 'undefined') {
                    log('info', `Package loaded: ${url} (${loadedCount}/${packageData.automata.length} automata)`);
                }

                return loadedCount;

            } catch (error) {
                console.error(`Failed to load package ${url}:`, error);
                if (typeof log !== 'undefined') {
                    log('error', `Failed to load package ${url}`, error);
                }
                if (typeof emit !== 'undefined') {
                    emit('error_occurred', {
                        error,
                        message: error.message,
                        stack: error.stack,
                        source: `package:${url}`,
                        severity: 'error'
                    });
                }
                throw error;
            }
        }

        sortAutomata(automata) {
            const sorted = [];
            const visited = new Set();

            const visit = (def) => {
                if (visited.has(def.name)) return;

                // Visit dependencies first
                if (def.dependencies && Array.isArray(def.dependencies)) {
                    for (const depName of def.dependencies) {
                        const dep = automata.find(a => a.name === depName);
                        if (dep) {
                            visit(dep);
                        } else {
                            if (typeof log !== 'undefined') {
                                log('warn', `Dependency not found: ${depName} for ${def.name}`);
                            }
                        }
                    }
                }

                visited.add(def.name);
                sorted.push(def);
            };

            // Sort by priority first
            const byPriority = [...automata].sort((a, b) => 
                (a.priority || 100) - (b.priority || 100)
            );

            for (const def of byPriority) {
                visit(def);
            }

            return sorted;
        }

        async loadAutomaton(def, sourceUrl) {
            try {
                if (typeof loadscreen !== 'undefined') {
                    loadscreen(`Loading ${def.name}...`);
                }

                // Log what this automaton does
                if (typeof log !== 'undefined') {
                    log('info', `Loading: ${def.name} v${def.version}`);
                    if (def.respondsto && def.respondsto.length > 0) {
                        log('info', `  Responds to: ${def.respondsto.join(', ')}`);
                    }
                    if (def.controls && def.controls.length > 0) {
                        log('info', `  Controls: ${def.controls.join(', ')}`);
                    }
                }

                // Execute the code to get automaton object
                const automaton = this.executeCode(def.code, def.name);

                // Store in registry
                this.automata.set(def.name, {
                    instance: automaton,
                    metadata: def,
                    sourceUrl: sourceUrl
                });

                if (typeof AKARI !== 'undefined') {
                    AKARI.automata._registry.set(def.name, automaton);
                }

                // Call setup
                if (automaton.setup) {
                    await automaton.setup();
                }

                if (typeof emit !== 'undefined') {
                    emit('automaton_loaded', {
                        name: def.name,
                        version: def.version,
                        respondsto: def.respondsto || [],
                        controls: def.controls || []
                    });
                }

            } catch (error) {
                console.error(`Failed to load automaton ${def.name}:`, error);
                if (typeof log !== 'undefined') {
                    log('error', `Failed to load automaton ${def.name}:`, error);
                }
                if (typeof emit !== 'undefined') {
                    emit('error_occurred', {
                        error,
                        message: error.message,
                        stack: error.stack,
                        source: `automaton:${def.name}`,
                        severity: 'error'
                    });
                }
            }
        }

        executeCode(code, automatonName) {
            try {
                // Create a function that executes the code
                // Note: We're not using modules, just plain script execution
                const wrappedCode = `
                    (function() {
                        var exports = {};
                        var module = { exports: exports };
                        ${code}
                        return module.exports.default || module.exports;
                    })();
                `;
                
                const automaton = eval(wrappedCode);
                return automaton;
                
            } catch (error) {
                console.error(`Code execution error in ${automatonName}:`, error);
                if (typeof log !== 'undefined') {
                    log('error', `Code execution error in ${automatonName}:`, error);
                }
                throw error;
            }
        }

        getConflicts() {
            const conflicts = [];
            const controlsMap = new Map();

            // Build a map of what each automaton controls
            for (const [name, entry] of this.automata) {
                const controls = entry.metadata.controls || [];
                for (const control of controls) {
                    if (!controlsMap.has(control)) {
                        controlsMap.set(control, []);
                    }
                    controlsMap.get(control).push(name);
                }
            }

            // Find conflicts (multiple automata controlling the same thing)
            for (const [control, automataList] of controlsMap) {
                if (automataList.length > 1) {
                    conflicts.push({
                        control,
                        automata: automataList,
                        priorities: automataList.map(name => {
                            const entry = this.automata.get(name);
                            return entry.metadata.priority || 100;
                        })
                    });
                }
            }

            return conflicts;
        }

        wait(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }
    }

    // Expose loader globally
    window.AutomatonLoader = AutomatonLoader;

})();
