import * as readline from 'readline';

export const promptUser = (question: string) => {
    return new Promise((resolve) => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        rl.question(question, (answer: any) => {
            resolve(answer);
            rl.close();
        });
    });
};