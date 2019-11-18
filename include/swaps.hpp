#include <eosio/eosio.hpp>
#include <eosio/asset.hpp>
#include <eosio/transaction.hpp>
#include <eosio.token.hpp>

using namespace eosio;
using std::string;

CONTRACT swaps : public contract {
  public:
    using contract::contract;
    swaps(name receiver, name code, datastream<const char*> ds):contract(receiver, code, ds)
    {}
    
    ACTION reset();
    
  private:
};
