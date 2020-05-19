import { inject, injectable } from 'tsyringe';

import AppError from '@shared/errors/AppError';

import IProductsRepository from '@modules/products/repositories/IProductsRepository';
import ICustomersRepository from '@modules/customers/repositories/ICustomersRepository';
import IUpdateProductsQuantityDTO from '@modules/products/dtos/IUpdateProductsQuantityDTO';
import Order from '../infra/typeorm/entities/Order';
import IOrdersRepository from '../repositories/IOrdersRepository';

interface IProduct {
  id: string;
  quantity: number;
}

interface IRequest {
  customer_id: string;
  products: IProduct[];
}

@injectable()
class CreateProductService {
  constructor(
    @inject('OrdersRepository')
    private ordersRepository: IOrdersRepository,
    @inject('ProductsRepository')
    private productsRepository: IProductsRepository,
    @inject('CustomersRepository')
    private customersRepository: ICustomersRepository,
  ) {}

  public async execute({ customer_id, products }: IRequest): Promise<Order> {
    const customer = await this.customersRepository.findById(customer_id);
    if (!customer) {
      throw new AppError('Customer not found');
    }

    const searchProducts = products.map(p => ({ id: p.id }));
    const dbProducts = await this.productsRepository.findAllById(
      searchProducts,
    );

    if (dbProducts.length !== products.length) {
      throw new AppError("There's an invalid item on your request.");
    }

    const newQuantities: IUpdateProductsQuantityDTO[] = [];

    const updateProducts = dbProducts.map(dbProduct => {
      const orderProduct = products.find(
        product => product.id === dbProduct.id,
      );

      if (orderProduct) {
        if (dbProduct.quantity < orderProduct.quantity) {
          throw new AppError(
            `${dbProduct.name} requested quantity (${orderProduct.quantity}) is greater than your storage (${dbProduct.quantity})`,
          );
        }

        newQuantities.push({
          id: orderProduct.id,
          quantity: dbProduct.quantity - orderProduct.quantity,
        });

        return {
          ...dbProduct,
          quantity: orderProduct.quantity,
        };
      }

      return dbProduct;
    });

    await this.productsRepository.updateQuantity(newQuantities);

    const order = await this.ordersRepository.create({
      customer,
      products: updateProducts.map(product => ({
        product_id: product.id,
        price: product.price,
        quantity: product.quantity,
      })),
    });

    return order;
  }
}

export default CreateProductService;
