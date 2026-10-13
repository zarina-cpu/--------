const fs = require('fs');
const path = 'C:\\Program Files\\PostgreSQL\\18\\data\\pg_hba.conf';

const content = `# PostgreSQL Client Authentication Configuration File
# TYPE  DATABASE        USER            ADDRESS                 METHOD
local   all             all                                     scram-sha-256
host    all             all             127.0.0.1/32            scram-sha-256
host    all             all             ::1/128                 scram-sha-256
local   replication     all                                     scram-sha-256
host    replication     all             127.0.0.1/32            scram-sha-256
host    replication     all             ::1/128                 scram-sha-256
`;

fs.writeFileSync(path, content, { encoding: 'utf8' });
console.log('pg_hba.conf secured (scram-sha-256)');
