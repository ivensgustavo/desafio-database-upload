import path from 'path';
import csvParse from 'csv-parse';
import fs from 'fs';
import { getRepository, getCustomRepository, In } from 'typeorm';
import Transaction from '../models/Transaction';
import uploadConfig from '../config/upload';
import Category from '../models/Category';
import TransactionsRepository from '../repositories/TransactionsRepository';

interface RequestDTO {
  fileName: string;
}

interface ImportedTransaction {
  title: string;
  type: 'income' | 'outcome';
  value: number;
  category: string;
}

/*

  Pra importar cada transaction é preciso ler cada linha do arquivo e criar uma transaction.
  A vírgula delimita uma informação da transaction;
  csv-parse é uma biblioteva para manipular arquivos csv.

  O fs é uma biblioteca nativa do Node que ajuda a abrir, ler arquivos...

*/

class ImportTransactionsService {
  async execute({ fileName }: RequestDTO): Promise<Transaction[]> {
    const filePath = path.join(uploadConfig.folder, fileName);

    const categoriesRepository = getRepository(Category);
    const transactionsRepository = getCustomRepository(TransactionsRepository);

    // cria um objeto de leitura
    const readStream = fs.createReadStream(filePath);

    const transactions: ImportedTransaction[] = [];
    const categories: string[] = [];

    // Crio a instância do csv-parse dizendo como vai ocorrer a tranformação
    // Por padrão o delimitador é a vírgula
    const parser = csvParse({
      from_line: 2,
    });

    // ler enquanto tiver linhas disponíveis
    const lines = readStream.pipe(parser);

    lines.on('data', async line => {
      const [title, type, value, category] = line.map((cell: string) => {
        return cell.trim();
      });

      if (!title || !type || !value || !category) return;

      categories.push(category);
      transactions.push({ title, type, value, category });
    });

    await new Promise(resolve => parser.on('end', resolve));

    // Book insert é inserir um conjunto de dados de uma vez pra não ficar
    // abrindo e fechando conexão pois assim se perde em desempenho
    // O método in vai verificar se um conjunto de categorias existe no bd

    // Pego as categorias que já existem no bd
    const existentCategories = await categoriesRepository.find({
      where: {
        title: In(categories),
      },
    });

    // Pego apenas os títulos das categorias que já existem
    const existentCategoriesTitles = existentCategories.map(
      category => category.title,
    );

    // A partir das categorias que recebi no arquivo vejo quais delas não existem no bd
    const nonExistentCategoriesTitles = categories
      .filter(category => !existentCategoriesTitles.includes(category))
      .filter((value, index, self) => self.indexOf(value) === index);

    // Adicione as categorias que não existem no banco
    const newCategories = await categoriesRepository.create(
      nonExistentCategoriesTitles.map(title => ({
        title,
      })),
    );

    await categoriesRepository.save(newCategories);

    // Junto todas as categorias
    const finalCategories = [...existentCategories, ...newCategories];

    // Salvo as transações no banco de uma só vez
    const createdTransactions = await transactionsRepository.create(
      transactions.map(transaction => ({
        title: transaction.title,
        type: transaction.type,
        value: transaction.value,
        category: finalCategories.find(
          category => category.title === transaction.category,
        ),
      })),
    );

    await transactionsRepository.save(createdTransactions);

    await fs.promises.unlink(filePath);

    return createdTransactions;
  }
}

export default ImportTransactionsService;
