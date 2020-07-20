import { getCustomRepository, getRepository } from 'typeorm';
import AppError from '../errors/AppError';

import TransactionsRepository from '../repositories/TransactionsRepository';
import Transaction from '../models/Transaction';
import Category from '../models/Category';

interface RequestDTO {
  title: string;
  value: number;
  type: 'income' | 'outcome';
  categoryTitle: string;
}

class CreateTransactionService {
  public async execute({
    title,
    value,
    type,
    categoryTitle,
  }: RequestDTO): Promise<Transaction> {
    const transactionsRepository = getCustomRepository(TransactionsRepository);
    const categoriesRepository = getRepository(Category);

    const { total } = await transactionsRepository.getBalance();

    if (type !== 'income' && type !== 'outcome') {
      throw new AppError('This type is invalid.');
    }

    if (type === 'outcome' && value > total) {
      throw new AppError(
        "You don't have enough balance to complete the transaction.",
      );
    }

    let findedCategory = await categoriesRepository.findOne({
      where: {
        title: categoryTitle,
      },
    });

    if (!findedCategory) {
      findedCategory = await categoriesRepository.create({
        title: categoryTitle,
      });

      await categoriesRepository.save(findedCategory);
    }

    const transaction = transactionsRepository.create({
      title,
      value,
      type,
      category_id: findedCategory.id,
    });

    await transactionsRepository.save(transaction);

    return transaction;
  }
}

export default CreateTransactionService;
