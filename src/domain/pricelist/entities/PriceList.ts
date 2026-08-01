import { PriceListItem } from "./PriceListItem";

import {
  PriceListCode,
  PriceListId,
} from "../value-objects";

export interface PriceListProps {

  id: PriceListId;

  companyId: string;

  code: PriceListCode;

  name: string;

  items?: PriceListItem[];

}

export class PriceList {

  private readonly items: PriceListItem[];

  constructor(
    private readonly props: PriceListProps,
  ) {

    this.items = props.items ?? [];

  }

  get id(): PriceListId {
    return this.props.id;
  }

  get companyId(): string {
    return this.props.companyId;
  }

  get code(): PriceListCode {
    return this.props.code;
  }

  get name(): string {
    return this.props.name;
  }

  getItems(): readonly PriceListItem[] {
    return [...this.items];
  }

  addItem(
    item: PriceListItem,
  ): void {

    this.items.push(item);

  }

  removeItem(
    id: string,
  ): void {

    const index =
      this.items.findIndex(
        x => x.props.id === id,
      );

    if (index >= 0) {
      this.items.splice(index, 1);
    }

  }

}
