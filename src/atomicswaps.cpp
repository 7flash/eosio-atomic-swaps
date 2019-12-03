#include <atomicswaps.hpp>

void atomicswaps::deposit(name caller, name receiver, asset amount, string memo) {
  if (receiver != get_self() || caller == get_self()) return;

  auto balance_itr = balances.find(caller.value);
  
  if (balance_itr == balances.end()) {
    balances.emplace(get_self(), [&](auto& balance) {
      balance.account = caller;
      balance.amount = amount;
    });
  } else {
    balances.modify(balance_itr, get_self(), [&](auto& balance) {
      balance.account = caller;
      balance.amount = amount;
    });
  }
}

void atomicswaps::open(name seller, name buyer, asset amount, checksum256 secretHash) {
  require_auth(seller);
  
  auto balance_itr = balances.find(seller.value);
  check(balance_itr->amount >= amount, "account does not have enough deposit: " + seller.to_string());
  
  auto seller_swaps = swaps.get_index<name("byseller")>();
  auto swap_itr = seller_swaps.begin();
  
  while (swap_itr != seller_swaps.end()) {
    check(swap_itr->buyer != buyer, "already active swap found between users " + seller.to_string() + " and " + buyer.to_string());
    swap_itr++;
  }
  
  swaps.emplace(get_self(), [&](auto& swap) {
    swap.id = swaps.available_primary_key();
    swap.seller = seller;
    swap.buyer = buyer;
    swap.amount = amount;
    swap.secret_hash = secretHash;
    swap.secret_value = checksum256();
    swap.created_at = current_time_point().sec_since_epoch();
  });

  balances.modify(balance_itr, get_self(), [&](auto& balance) {
    balance.amount -= amount;
  });
}

void atomicswaps::close(name seller, name buyer, checksum256 secretValue) {
  auto seller_swaps = swaps.get_index<name("byseller")>();
  auto swap_itr = seller_swaps.begin();
  
  while (swap_itr != seller_swaps.end()) {
    if (swap_itr->buyer == buyer) {
      break;
    }
    swap_itr++;
  }
  
  check(swap_itr != seller_swaps.end(), "no active swap found between users " + seller.to_string() + " and " + buyer.to_string());
  
  uint64_t current_time = current_time_point().sec_since_epoch();
  uint64_t expiration_time = swap_itr->created_at + timeout_in_seconds;
  
  if (current_time < expiration_time) {
    auto secretValueBytes = secretValue.extract_as_byte_array();
    checksum256 secretHash = sha256((const char*)secretValueBytes.data(), secretValueBytes.size());
    
    check(swap_itr->secret_hash == secretHash, "revealed secret does not match expected hash");
  
    auto balance_itr = balances.find(buyer.value);
    if (balance_itr == balances.end()) {
      balances.emplace(get_self(), [&](auto& balance) {
        balance.account = buyer;
        balance.amount = swap_itr->amount;
      });
    } else {
      balances.modify(balance_itr, get_self(), [&](auto& balance) {
        balance.amount += swap_itr->amount;
      });
    }
  } else {
    auto balance_itr = balances.find(seller.value);
    balances.modify(balance_itr, get_self(), [&](auto& balance) {
      balance.amount += swap_itr->amount;
    });
  }
  
  seller_swaps.erase(swap_itr);
}

void atomicswaps::withdraw(name account, asset amount) {
  require_auth(account);
  
  auto balance_itr = balances.find(account.value);
  
  check(balance_itr != balances.end(), "account has empty deposit: " + account.to_string());
  check(balance_itr->amount >= amount, "account does not have enough deposit: " + account.to_string());
  
  balances.modify(balance_itr, get_self(), [&](auto& balance) {
    balance.amount -= amount;
  });
  
  action(
    permission_level{name("atomicswaps1"), name("active")},
    name("eosio.token"), name("transfer"),
    make_tuple(get_self(), account, amount, string(""))
  ).send();
}

extern "C" void apply(uint64_t receiver, uint64_t code, uint64_t action) {
  if (action == name("transfer").value && code == name("eosio.token").value) {
    execute_action<atomicswaps>(name(receiver), name(code), &atomicswaps::deposit);
  } else {
    switch (action) {
      case name("open").value:
        execute_action(name(receiver), name(code), &atomicswaps::open);
        break;
  
      case name("close").value:
        execute_action(name(receiver), name(code), &atomicswaps::close);
        break;
        
      case name("withdraw").value:
        execute_action(name(receiver), name(code), &atomicswaps::withdraw);
    }
  }
}