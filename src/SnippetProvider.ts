import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

// Define the structure of our snippet object, same as in extension.ts
interface Snippet {
    id: string;
    description: string;
    body: string;
    source?: string; // The file path, e.g., 'c:\project\main.js'
    range?: { // The selection range
        start: { line: number, character: number };
        end: { line: number, character: number };
    };
}

export class SnippetProvider implements vscode.TreeDataProvider<SnippetTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<SnippetTreeItem | undefined | null | void> = new vscode.EventEmitter<SnippetTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<SnippetTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private searchTerm: string = ''; // <-- ADD THIS LINE

    constructor(private workspaceRoot: string | undefined) {}

    // This method is called by VS Code when the view needs to be refreshed
    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    // ADD THIS ENTIRE METHOD TO THE SnippetProvider CLASS
    public search(term: string): void {
        this.searchTerm = term.toLowerCase();
        this.refresh();
    }

    // This method is called for each item in the tree to get its visual representation
    getTreeItem(element: SnippetTreeItem): vscode.TreeItem {
        return element;
    }

    // --- MODIFIED getChildren METHOD WITH FILTERING ---
    getChildren(element?: SnippetTreeItem): Thenable<SnippetTreeItem[]> {
        if (!this.workspaceRoot) {
            vscode.window.showInformationMessage('No snippets found. Open a workspace folder.');
            return Promise.resolve([]);
        }

        const snippetsFilePath = path.join(this.workspaceRoot, '.vscode', 'snippets.json');
        if (fs.existsSync(snippetsFilePath)) {
            try {
                const fileContent = fs.readFileSync(snippetsFilePath, 'utf-8');
                let snippets: Snippet[] = JSON.parse(fileContent);

                // --- NEW FILTERING LOGIC ---
                if (this.searchTerm) {
                    snippets = snippets.filter(snippet => 
                        snippet.description.toLowerCase().includes(this.searchTerm) ||
                        snippet.body.toLowerCase().includes(this.searchTerm)
                    );
                }
                // --- END OF NEW LOGIC ---
                
                return Promise.resolve(snippets.map(snippet => 
                    new SnippetTreeItem(snippet.description, vscode.TreeItemCollapsibleState.None, snippet)
                ));
            } catch (error) {
                vscode.window.showErrorMessage('Error reading snippets.json file.');
                return Promise.resolve([]);
            }
        } else {
            return Promise.resolve([]);
        }
    }
}

// This helper class extends the default TreeItem to hold our full snippet object
class SnippetTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly snippetData: Snippet
    ) {
        super(label, collapsibleState);
        this.tooltip = `Click to insert snippet`;
        this.description = this.snippetData.body.substring(0, 40).replace(/\s+/g, ' ').trim() + '...';

        // --- THIS IS THE NEW PART ---
        // Define the command that will be executed when the item is clicked
        this.command = {
            command: 'contextual-snippet.insertSnippet',
            title: 'Insert Snippet',
            arguments: [this.snippetData.body] // Pass the snippet's code as an argument
        };

        // --- CONTEXT VALUE FOR CONTEXT MENU ---
        this.contextValue = this.snippetData.source ? 'snippetTreeItemWithSource' : 'snippetTreeItem';
    }
}
