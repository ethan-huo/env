#!/usr/bin/env -S bun --no-env-file
import { Command } from 'commander'
import { getCommand } from './commands/get'
import { setCommand } from './commands/set'
import { rmCommand } from './commands/rm'
import { lsCommand } from './commands/ls'
import { diffCommand } from './commands/diff'
import { syncCommand } from './commands/sync'
import { initCommand } from './commands/init'

const program = new Command()

program
  .name('env')
  .description('Environment variable management tool')
  .version('0.1.0')
  .option('-c, --config <path>', 'config file path', 'env.config.ts')

program.addCommand(getCommand)
program.addCommand(setCommand)
program.addCommand(rmCommand)
program.addCommand(lsCommand)
program.addCommand(diffCommand)
program.addCommand(syncCommand)
program.addCommand(initCommand)

program.parse()
