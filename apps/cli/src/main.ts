import { Command } from 'commander';
import { addSalonCommand } from './commands/add-salon';
import { linkTelegramCommand } from './commands/link-telegram';
import { triggerSyncCommand } from './commands/trigger-sync';

const program = new Command('altegio-cli')
  .description('Altegio AI admin CLI');

program.addCommand(addSalonCommand());
program.addCommand(linkTelegramCommand());
program.addCommand(triggerSyncCommand());

// pnpm passes a literal "--" as the first extra arg when using `pnpm cli -- <cmd>`.
// Strip it so Commander can correctly parse the subcommand.
const argv = process.argv.filter((a, i) => !(i === 2 && a === '--'));

program.parseAsync(argv).catch((err) => {
  console.error(err);
  process.exit(1);
});
