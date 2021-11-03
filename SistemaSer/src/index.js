const util = require('util');
const fs = require('fs');
const path = require('path');
const readFile = util.promisify(fs.readFile);
const axios = require('axios');
const moment = require('moment-timezone');
const uuid = require('uuid/v4');

// Configurações
const CREDENTIALS = 'c2VyLmVkdWNhY2lvbmFsLmFjYzpZb2Q5azkyTXpi';
const TELEFONE_ENVIO = '558181572941';
const AGGREGATE_ID = '102560';
const separator = ';';
const breakLine = '\r\n';

async function readContents(fileName) {
  try {
    const directoryPath = `${path.join(__dirname)}/${fileName}`;
    const file = await readFile(directoryPath, 'utf8');
    console.log('Arquivo lido com sucesso, iniciando processamento');
    return formatFile(file, fileName);
  } catch (err) {
    console.log('Erro lendo arquivo', err);
  }
}

const formatFile = (file, fileName) => {
  const lines = file.split(breakLine);
  const header = lines.shift().split(separator);

  console.log(`Arquivo possui ${lines.length} registros`);

  const formats = [
    {
      format: 'inscritos',
      fields: [
        {
          name: 'PENDENTE_REDACAO',
          value: 'pendenteRedacao'
        },
        {
          name: 'MATRICULADO',
          value: 'matriculado'
        },
        {
          name: 'PAGAMENTO_PENDENTE',
          value: 'pagamentoPendente'
        },
        {
          name: 'MODALIDADE',
          value: 'modalidade'
        },
        {
          name: 'CELULAR',
          value: 'to'
        },
        {
          name: 'C1_MARCA',
          value: 'marca'
        }
      ]
    },
    {
      format: 'leads',
      fields: [
        {
          name: 'CELULAR',
          value: 'to'
        },
        {
          name: 'C1_MARCA',
          value: 'marca'
        }
      ]
    }
  ];

  const format = formats.find((item) => fileName.startsWith(item.format));
  console.log(format);

  if (format && format.fields) {
    const { fields } = format;

    let invalidMailing = false;
    fields.forEach((item) => {
      item.position = header.indexOf(item.name);

      if (item.position === -1) {
        invalidMailing = true;
      }
    });

    if (invalidMailing) {
      console.log('Campos obrigatórios faltando no arquivo', {
        fileName,
        invalidFields: fields.flatMap((item) => (item.position === -1 ? [item.name] : []))
      });
      return [];
    }

    const list = [];
    lines.forEach((line) => {
      const entry = line.split(separator);
      if (line !== '') {
        const obj = {};
        fields.forEach((field) => {
          obj[field.value] = entry[field.position] ? entry[field.position].split('"').join('') : '';
        });
        obj.tipoArquivo = format.format;
        list.push(obj);
      }
    });

    return list;
  } else {
    console.log('Formato de arquivo inválido');
  }
};

const processFile = async (fileName) => {
  const list = await readContents(fileName);
  let enviados = 0;
  let erros = 0;

  for (const item of list) {
    const { tipoArquivo } = item;

    const { isValid, type } = checkRules(tipoArquivo, item);

    if (isValid) {
      // montar payload
      const payload = formatPayload(item, item.marca, type || tipoArquivo);

      // chamar zenvia
      const success = await sendMessage(payload);
      success ?  erros++ : enviados++;
    } else {
      console.log('Lead não receberá disparos');
    }
    
  }

  console.log(`${enviados} mensagens enviadas e ${list.length - enviados} não entraram nas regras de envio`);
  console.log(`Resultados:
    Total: ${list.length}
    Enviados: ${enviados}
    Erros: ${erros}
    `);
};

/*
 validar a marca UNINABUCO, UNAMA, UniNORTE ou UNG
 Redação pendente + EAD = disparo de sms cobrando redação
 redação pendente + ENEM = disparo de sms cobrando notas do enem
*/
const checkRules = (type, lead) => {
  const { matriculado, pendenteRedacao, pagamentoPendente, modalidade } = lead;

  switch (type) {
    case 'leads':
        console.log("tabela leads")
      return { isValid: true, type: 'PRIMEIRO_CONTATO' };
    case 'inscritos':
      if (matriculado === 'SIM') {
        console.log('Aluno já matriculado');
        return { isValid: false };
      }

      if (pendenteRedacao === 'SIM') {
          console.log("Validando ingresso EAD ou ENEM")
        return { isValid: true, type: modalidade === 'EAD' ? 'REDACAO' : 'ENEM' };
      }
      if (pagamentoPendente === 'SIM') {
        return { isValid: true, type: 'PAGAMENTO' };
      }
      return { isValid: false };
    default:
      console.log('Tipo de arquivo desconhecido');
      throw new Error('Tipo de arquivo desconhecido');
  }
};

const formatPayload = (data, marca, type) => {
  let from = TELEFONE_ENVIO;

  const messages = [
    {
      marca: '5',
      type: 'PRIMEIRO_CONTATO',
      message:
        'UNINABUCO Digital te da boas-vindas! Escolha o seu CURSO e faca a sua INSCRICAO para comecar a estudar https://bit.ly/3mtpTdb'
    },
    {
      marca: '94',
      type: 'PRIMEIRO_CONTATO',
      message: 'UNAMA Digital te da boas-vindas! Escolha o seu CURSO e faca a sua INSCRICAO para comecar a estudar https://bit.ly/3GzTObl'
    },
    {
      marca: '130',
      type: 'PRIMEIRO_CONTATO',
      message:
        'UniNORTE Digital te da boas-vindas! Escolha o seu CURSO e faca a sua INSCRICAO para comecar a estudar https://bit.ly/3vWOsSF'
    },
    {
      marca: '32',
      type: 'PRIMEIRO_CONTATO',
      message:
      'UNG/UNIVERITAS Digital te da boas-vindas! Escolha o seu CURSO e faca a sua INSCRICAO para comecar a estudar https://bit.ly/3mpbo9Z'
    },
    {
      marca: '5',
      type: 'PAGAMENTO',
      message:
        'UNINABUCO Digital: Falta pouco para garantir a sua vaga. Pague hoje a 1a. Mensalidade. Duvidas? Chama no whats: https://bit.ly/3AzUGtj'
    },
    {
      marca: '94',
      type: 'PAGAMENTO',
      message:
        'UNAMA Digital: Falta pouco para garantir a sua vaga. Pague hoje a 1a. Mensalidade. Duvidas? Chama no whats https://bit.ly/3o20zMj'
    },
    {
      marca: '130',
      type: 'PAGAMENTO',
      message:
        'UniNorte Digital: Falta pouco para garantir a sua vaga. Pague hoje a 1a. Mensalidade. Duvidas? Chama no whats https://bit.ly/3AIfsH1'
    },
    {
      marca: '32',
      type: 'PAGAMENTO',
      message:
        'UNG-UNIVERITAS: Falta pouco para garantir a sua vaga. Pague hoje a 1a. Mensalidade. Duvidas? Chama no whats https://bit.ly/3ELwqXE'
    },
    {
      marca: '5',
      type: 'ENEM',
      message:
        'UNINABUCO Digital: Garanta a sua VAGA no Ensino Superior. Envie hoje seu comprovante do ENEM. Duvidas? Chama no whats: https://bit.ly/3AzUGtj'
    },
    {
      marca: '94',
      type: 'ENEM',
      message:
        'UNAMA Digital: Garanta a sua VAGA no Ensino Superior. Envie hoje seu comprovante do ENEM. Duvidas? Chama no whats https://bit.ly/3o20zMj'
    },
    {
      marca: '130',
      type: 'ENEM',
      message:
        'UniNorte Digital: Garanta a sua VAGA no Ensino Superior. Envie hoje seu comprovante do ENEM. Duvidas? Chama no whats https://bit.ly/3AIfsH1'
    },
    {
      marca: '32',
      type: 'ENEM',
      message:
        'UNG-UNIVERITAS Digital: Garanta a sua VAGA no Ensino Superior. Envie hoje seu comprovante do ENEM. Duvidas? Chama no whats https://bit.ly/3ELwqXE'
    },
    {
      marca: '5',
      type: 'REDACAO',
      message:
        'UNINABUCO Digital: Garanta a sua VAGA no Ensino Superior. Faca hoje sua REDACAO. Duvidas? Chama no Whats https://bit.ly/3EudxYh'
    },
    {
      marca: '94',
      type: 'REDACAO',
      message:
        'UNAMA Digital: Garanta a garantir sua VAGA no Ensino Superior. Faca hoje sua REDACAO. Duvidas? Chama no Whats https://bit.ly/3jQTz29'
    },
    {
      marca: '130',
      type: 'REDACAO',
      message:
        'UniNorte Digital: Garanta a sua VAGA no Ensino Superior. Faca hoje sua REDACAO. Duvidas? Chama no Whats https://bit.ly/3pMNiIz'
    },
    {
      marca: '32',
      type: 'REDACAO',
      message:
        'UNG-UNIVERITAS Digital: Garanta a sua VAGA no Ensino Superior. Faca hoje sua REDACAO. Duvidas? Chama no Whats https://bit.ly/3mqq3BM'
    }
  ];

  switch (marca) {
    case '5': // UNINABUCO
      from = '558181572941';
      break;
    case '130': // UNINORTE
      from = '558182578679';
      break;
    case '94': // UNAMA
      from = '558181618351';
      break;
    case '32': // UNG/UNIVERITAS
      from = '558181722453';
      break;
    default:
      console.log('Marca inválida');
      throw new Error('Marca inválida');
  }

  const match = messages.find((item) => item.marca === marca && item.type === type);

  const payload = {
    sendSmsRequest: {
      from,
      schedule: moment().add(1, 'minute').tz('America/Sao_Paulo').format(),
      to: data.to.startsWith('55') ? data.to : `55${data.to}`,
      msg: match.message,
      callbackOption: 'NONE',
      id: uuid(),
      aggregateId: AGGREGATE_ID,
      flashSms: false
    }
  };
  return payload;
};

const sendMessage = async (data) => {
  try {
    const res = await axios({
      method: 'post',
      url: 'https://api-rest.zenvia.com/services/send-sms',
      headers: { 'content-type': 'application/json', Authorization: `Basic ${CREDENTIALS}` },
      data
    });
    
    if (res.data && res.data.statusCode) {
      if (res.data.statusCode == '00') {
        console.log('Mensagem enviada com sucesso', data.sendSmsRequest.to);
        return true;
      }
      return false;
    }
  } catch (err) {
    console.log('Erro ao enviar mensagem', err);
    return false;
    // TODO Salvar em novo csv de erros
  }
};

const fetchFiles = () => {
  const directoryPath = path.join(__dirname);

  console.log(directoryPath);
  const files = fs.readdirSync(directoryPath);

  return files.filter((item) => item.includes('.csv'));
};

(async () => {
  // Ver arquivos na pasta
  const files = fetchFiles();
  for (const file of files) {
    await processFile(file);
  }
})();
