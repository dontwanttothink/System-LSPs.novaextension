/** path -> active (started) language server object */
let langservers = new Map();
langservers.deactivate = function() {
    for (const langserver of this.values()) {
        langserver.deactivate();
    }
    this.clear();
}

const PATHS_CONFIG = "SystemLSPs.language-server-paths";
const SYNTAXES_CONFIG = "SystemLSPs.language-server-syntaxes";

function initializeLanguageServers() {
    langservers.deactivate();

    const newPaths = nova.config.get(PATHS_CONFIG) ?? [];
    const newSyntaxes = nova.config.get(SYNTAXES_CONFIG) ?? [];

    if (newPaths.length != newSyntaxes.length) {
        console.warn("Whoops! Mismatched configuration lengths.");
    }

    for (let i = 0; i < Math.min(newPaths.length, newSyntaxes.length); ++i) {
        const path = newPaths[i];
        const syntaxes = newSyntaxes[i].split(",");

        const langserver = new SystemLanguageServer(path, syntaxes);
        langserver.start();
        langservers.set(path, langserver);
    }
}


exports.activate = function() {
    initializeLanguageServers();
    nova.config.onDidChange(PATHS_CONFIG, () => {
        initializeLanguageServers();
    });
    nova.config.onDidChange(SYNTAXES_CONFIG, () => {
        initializeLanguageServers();
    })
}

exports.deactivate = function() {
    langservers.deactivate();
}


class SystemLanguageServer {
    constructor(path, syntaxes) {
        this.path = path;
        this.syntaxes = syntaxes;
        this.languageClient = null;

        this.shouldRestart = 3;
    }

    deactivate() {
        this.stop();
    }

    start() {
        if (this.languageClient) {
            this.languageClient.stop();
            nova.subscriptions.remove(this.languageClient);
        }

        const path = this.path.split(" ");
        const [actualPath] = path;
        const args = path.slice(1);

        // Create the client
        const serverOptions = {
            path: actualPath,
            args,
        };
        const clientOptions = {
            // The set of document syntaxes for which the server is valid
            syntaxes: this.syntaxes,
        };
        console.log(JSON.stringify(clientOptions));

        const client = new LanguageClient('example-langserver-' + this.path, this.path + " (System LSP)", serverOptions, clientOptions);

        client.onDidStop((maybeError) => {
            if (maybeError) {
                // unexpected exit
                console.error("The server for " + this.path + " exited unexpectedly.");
                if (this.shouldRestart) {
                    --this.shouldRestart;
                    console.error("Starting again (" + this.shouldRestart + ") remaining.");
                    this.start();
                }
            }
        });

        try {
            // Start the client
            client.start();

            // Add the client to the subscriptions to be cleaned up
            nova.subscriptions.add(client);
            this.languageClient = client;
        }
        catch (err) {
            // If the .start() method throws, it's likely because the path to the language server is invalid
            console.error(err);
        }
    }

    stop() {
        if (this.languageClient) {
            this.languageClient.stop();
            nova.subscriptions.remove(this.languageClient);
            this.languageClient = null;
        }
    }
}
