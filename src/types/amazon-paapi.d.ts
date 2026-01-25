declare module '@alonseg/amazon-paapi' {
  interface CommonParameters {
    AccessKey: string;
    SecretKey: string;
    PartnerTag: string;
    PartnerType: string;
    Marketplace: string;
  }

  interface GetItemsParameters {
    ItemIds: string[];
    ItemIdType: string;
    Condition?: string;
    Resources?: string[];
  }

  interface GetItemsResponse {
    ItemsResult?: {
      Items?: any[];
    };
    Errors?: any[];
  }

  function GetItems(
    commonParameters: CommonParameters,
    requestParameters: GetItemsParameters
  ): Promise<GetItemsResponse>;

  export default {
    GetItems,
  };
}
