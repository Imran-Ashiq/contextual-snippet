import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { randomBytes } from 'crypto';
import { SnippetProvider } from './SnippetProvider'; // <-- IMPORT our new provider

// Define the structure of our snippet object
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

export function activate(context: vscode.ExtensionContext) {

    // --- NEW SNIPPET PROVIDER LOGIC ---
    const rootPath = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0
        ? vscode.workspace.workspaceFolders[0].uri.fsPath : undefined;

    const snippetProvider = new SnippetProvider(rootPath);

    vscode.window.registerTreeDataProvider(
        'snippet-explorer', // This ID must match the view ID in package.json
        snippetProvider
    );

    // Command to refresh the view
    vscode.commands.registerCommand('snippet-explorer.refreshEntry', () =>
        snippetProvider.refresh()
    );

    // --- ADD THIS NEW COMMAND REGISTRATION ---
    vscode.commands.registerCommand('contextual-snippet.insertSnippet', (snippetBody: string) => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            editor.edit(editBuilder => {
                editBuilder.insert(editor.selection.active, snippetBody);
            });
        }
    });
    // --- END NEW COMMAND ---

    // --- ADD THE DELETE COMMAND REGISTRATION ---
    vscode.commands.registerCommand('contextual-snippet.deleteSnippet', (item: any) => {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            vscode.window.showErrorMessage("No workspace folder open.");
            return;
        }
        const workspacePath = workspaceFolders[0].uri.fsPath;
        const snippetsFilePath = path.join(workspacePath, '.vscode', 'snippets.json');

        try {
            if (fs.existsSync(snippetsFilePath)) {
                const fileContent = fs.readFileSync(snippetsFilePath, 'utf-8');
                let snippets: Snippet[] = JSON.parse(fileContent);

                // Filter out the snippet with the matching ID
                const updatedSnippets = snippets.filter(snippet => snippet.id !== item.snippetData.id);

                // Write the updated array back to the file
                fs.writeFileSync(snippetsFilePath, JSON.stringify(updatedSnippets, null, 4));

                vscode.window.showInformationMessage(`Snippet '${item.label}' deleted.`);
                snippetProvider.refresh(); // Refresh the view
            }
        } catch (error) {
            console.error("Failed to delete snippet:", error);
            vscode.window.showErrorMessage("An error occurred while deleting the snippet.");
        }
    });
    // --- END DELETE COMMAND ---

    // --- ADD THE COPY COMMAND REGISTRATION ---
    vscode.commands.registerCommand('contextual-snippet.copySnippet', (item: any) => {
        if (item && item.snippetData && item.snippetData.body) {
            vscode.env.clipboard.writeText(item.snippetData.body);
            vscode.window.showInformationMessage('Snippet copied to clipboard!');
        }
    });
    // --- END COPY COMMAND ---

    // --- ADD THE GO TO SOURCE COMMAND REGISTRATION ---
    vscode.commands.registerCommand('contextual-snippet.goToSource', async (item: any) => {
        if (item && item.snippetData && item.snippetData.source && item.snippetData.range) {
            try {
                const filePath = item.snippetData.source;
                const rangeData = item.snippetData.range;

                const doc = await vscode.workspace.openTextDocument(filePath);
                const editor = await vscode.window.showTextDocument(doc);

                const startPosition = new vscode.Position(rangeData.start.line, rangeData.start.character);
                const endPosition = new vscode.Position(rangeData.end.line, rangeData.end.character);
                const selection = new vscode.Selection(startPosition, endPosition);

                editor.selection = selection;
                editor.revealRange(selection, vscode.TextEditorRevealType.InCenter);

            } catch (error) {
                console.error("Could not open snippet source:", error);
                vscode.window.showErrorMessage('Could not open the source file. It may have been moved or deleted.');
            }
        } else {
            vscode.window.showInformationMessage("This snippet does not have a saved source location.");
        }
    });
    // --- END GO TO SOURCE COMMAND ---

    // --- ADD THE SEARCH COMMAND REGISTRATION ---
    vscode.commands.registerCommand('contextual-snippet.searchSnippets', async () => {
        const term = await vscode.window.showInputBox({
            prompt: "Search your snippets...",
            placeHolder: "e.g., api fetch"
        });
        if (term !== undefined) {
            vscode.commands.executeCommand('setContext', 'contextual-snippet.searchActive', !!term);
            snippetProvider.search(term);
        }
    });

    // --- ADD THE CLEAR SEARCH COMMAND REGISTRATION ---
    vscode.commands.registerCommand('contextual-snippet.clearSearch', () => {
        vscode.commands.executeCommand('setContext', 'contextual-snippet.searchActive', false);
        snippetProvider.search('');
    });
    // --- END SEARCH COMMANDS ---

    let disposable = vscode.commands.registerCommand('contextual-snippet.saveSnippet', async () => {
        
        const editor = vscode.window.activeTextEditor;

        if (editor && !editor.selection.isEmpty) {
            const selection = editor.selection;
            const highlightedText = editor.document.getText(selection);

            const description = await vscode.window.showInputBox({
                prompt: "Enter a description for your snippet",
                placeHolder: "e.g., Function to fetch API data"
            });

            if (description) {
                const workspaceFolders = vscode.workspace.workspaceFolders;
                if (!workspaceFolders) {
                    vscode.window.showErrorMessage("No workspace folder open. Cannot save snippet.");
                    return;
                }
                const workspacePath = workspaceFolders[0].uri.fsPath;
                
                const snippetsFolderPath = path.join(workspacePath, '.vscode');
                const snippetsFilePath = path.join(snippetsFolderPath, 'snippets.json');

                const newSnippet: Snippet = {
                    id: randomBytes(16).toString('hex'),
                    description: description,
                    body: highlightedText,
                    source: editor.document.uri.fsPath,
                    range: {
                        start: { line: selection.start.line, character: selection.start.character },
                        end: { line: selection.end.line, character: selection.end.character }
                    }
                };

                try {
                    if (!fs.existsSync(snippetsFolderPath)) {
                        fs.mkdirSync(snippetsFolderPath);
                    }

                    let snippets: Snippet[] = [];
                    if (fs.existsSync(snippetsFilePath)) {
                        const fileContent = fs.readFileSync(snippetsFilePath, 'utf-8');
                        snippets = JSON.parse(fileContent);
                    }

                    snippets.push(newSnippet);
                    fs.writeFileSync(snippetsFilePath, JSON.stringify(snippets, null, 4));

                    vscode.window.showInformationMessage(`Snippet '${description}' saved successfully!`);
                    snippetProvider.refresh();

                } catch (error) {
                    console.error("Failed to save snippet:", error);
                    vscode.window.showErrorMessage("An error occurred while saving the snippet.");
                }
            } else {
                vscode.window.showWarningMessage('Snippet saving cancelled.');
            }
        } else {
            vscode.window.showInformationMessage("Please select some text to save as a snippet.");
        }
    });

    context.subscriptions.push(disposable);
}

export function deactivate() {}
