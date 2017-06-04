<?php
namespace Deployer;
require 'recipe/common.php';

// Configuration

set('ssh_type', 'native');
set('ssh_multiplexing', true);

serverList('deploy/servers.yml');

// Configuration
set('env', 'prod');
set('default_stage', 'production');
set('repository', 'git@github.com:tchapi/slack-he.git');
set('shared_files', []);
set('shared_dirs', []);
set('writable_dirs', []);
set('bin/npm', function () {
    return (string)run('which npm');
});


// Add clear_paths
set('clear_paths', [
  './README.md',
  './deploy.php',
  './.gitignore',
  './LICENSE',
  './structure.sqlite',
  './config.json.dist',
  './_SOURCES_',
  './.git',
  './deploy',
]);

// Tasks
desc('Run NPM install');
task('deploy:npm_install', function() {
  run("cd {{release_path}} && {{bin/npm}} install");
});

desc('Deploy production parameters');
task('deploy:parameters', function () {
    upload('./deploy/config.{{env}}.json', '{{deploy_path}}/release/config.json');
});

desc('Deploy the project');
task('deploy', [
    'deploy:prepare',
    'deploy:lock',
    'deploy:release',
    'deploy:update_code',
    'deploy:npm_install',
    'deploy:shared',
    'deploy:writable',
    'deploy:clear_paths',
    'deploy:symlink',
    'deploy:unlock',
    'cleanup',
    'success'
]);

// [Optional] if deploy fails automatically unlock.
after('deploy:update_code', 'deploy:parameters');
after('deploy:failed', 'deploy:unlock');
