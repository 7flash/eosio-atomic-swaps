#include <eosio/eosio.hpp>
#include <eosio/asset.hpp>
#include <eosio/system.hpp>
#include <eosio/crypto.hpp>

using namespace eosio;
using std::string;

CONTRACT atomicswaps : public contract {
  public:
    using contract::contract;
    atomicswaps(name receiver, name code, datastream<const char*> ds)
      : contract(receiver, code, ds),
        balances(receiver, receiver.value),
        swaps(receiver, receiver.value)
    {}
    
    ACTION deposit(name caller, name receiver, asset amount, string memo);
    
    ACTION open(name seller, name buyer, asset amount, checksum256 secretHash);
    
    ACTION close(name seller, name buyer, checksum256 secretValue);

    ACTION withdraw(name account, asset quantity);
  private:
    symbol token_symbol = symbol("TLOS", 4);
    uint64_t timeout_in_seconds = 3;
    
    TABLE balance_table {
      name account;
      asset amount;
      
      uint64_t primary_key()const { return account.value; }
    };
    
    TABLE swap_table {
      uint64_t id;
      name seller;
      name buyer;
      asset amount;
      uint64_t created_at;
      checksum256 secret_hash;
      checksum256 secret_value;
      
      uint64_t primary_key()const { return id; }
      uint64_t by_seller()const { return seller.value; }
      uint64_t by_buyer()const { return buyer.value; }
    };
    
    typedef multi_index<"balances"_n, balance_table> balance_tables;
    
    typedef multi_index<"swaps"_n, swap_table,
      indexed_by<"byseller"_n, const_mem_fun<swap_table, uint64_t, &swap_table::by_seller>>,
      indexed_by<"bybuyer"_n, const_mem_fun<swap_table, uint64_t, &swap_table::by_buyer>>
    > swap_tables;
    
    balance_tables balances;
    
    swap_tables swaps;
};
